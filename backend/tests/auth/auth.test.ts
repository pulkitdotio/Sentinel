import pino from 'pino';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/api/app';
import { verifyPassword } from '../../src/modules/auth/password';
import type {
  CreateUserRecord,
  UserCredentials,
  UserProfile,
  UserRepository,
} from '../../src/modules/auth/user-repository';

const JWT_SECRET = 'a-test-secret-that-is-long-enough';
const PASSWORD = 'strong-password';
const INVALID_CREDENTIALS_RESPONSE = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
  },
};

const authResponseSchema = z.object({
  token: z.string().min(1),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

const meResponseSchema = z.object({
  user: authResponseSchema.shape.user,
});

function responseBody(response: Response): unknown {
  return response.body as unknown;
}

class InMemoryUserRepository implements UserRepository {
  private readonly usersByEmail = new Map<string, UserCredentials>();
  private nextId = 1;

  public create(input: CreateUserRecord): Promise<UserProfile> {
    if (this.usersByEmail.has(input.email)) {
      return Promise.reject(Object.assign(new Error('duplicate key'), { code: 11_000 }));
    }

    const now = new Date('2026-01-01T00:00:00.000Z');
    const user: UserCredentials = {
      id: String(this.nextId++).padStart(24, '0'),
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    this.usersByEmail.set(user.email, user);

    return Promise.resolve(this.toProfile(user));
  }

  public findByEmail(email: string): Promise<UserCredentials | null> {
    const user = this.usersByEmail.get(email);
    return Promise.resolve(user ? { ...user } : null);
  }

  public findById(userId: string): Promise<UserProfile | null> {
    const user = [...this.usersByEmail.values()].find((candidate) => candidate.id === userId);
    return Promise.resolve(user ? this.toProfile(user) : null);
  }

  public getStoredUser(email: string): UserCredentials | undefined {
    return this.usersByEmail.get(email);
  }

  private toProfile(user: UserCredentials): UserProfile {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

function createTestContext(): {
  app: ReturnType<typeof createApp>;
  userRepository: InMemoryUserRepository;
} {
  const userRepository = new InMemoryUserRepository();
  const app = createApp({
    logger: pino({ enabled: false }),
    isProduction: false,
    auth: {
      secret: JWT_SECRET,
      expiresIn: '7d',
      userRepository,
    },
  });

  return { app, userRepository };
}

async function registerUser(app: ReturnType<typeof createApp>): Promise<Response> {
  return request(app).post('/api/v1/auth/register').send({
    name: 'Pulkit',
    email: 'user@example.com',
    password: PASSWORD,
  });
}

describe('authentication API', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
  });

  it('registers a user successfully with a normalized email', async () => {
    const response = await request(context.app).post('/api/v1/auth/register').send({
      name: '  Pulkit  ',
      email: '  USER@Example.COM ',
      password: PASSWORD,
    });
    const body = authResponseSchema.parse(responseBody(response));

    expect(response.status).toBe(201);
    expect(body.user).toMatchObject({ name: 'Pulkit', email: 'user@example.com' });
  });

  it('rejects invalid registration input', async () => {
    const response = await request(context.app).post('/api/v1/auth/register').send({
      name: '',
      email: 'not-an-email',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('short');
  });

  it('rejects duplicate email registration after normalization', async () => {
    await registerUser(context.app);
    const response = await request(context.app).post('/api/v1/auth/register').send({
      name: 'Another User',
      email: ' USER@EXAMPLE.COM ',
      password: 'another-strong-password',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists',
      },
    });
  });

  it('stores a password hash instead of the plaintext password', async () => {
    await registerUser(context.app);
    const storedUser = context.userRepository.getStoredUser('user@example.com');

    expect(storedUser?.passwordHash).toBeDefined();
    expect(storedUser?.passwordHash).not.toBe(PASSWORD);
    await expect(verifyPassword(storedUser?.passwordHash ?? '', PASSWORD)).resolves.toBe(true);
  });

  it('logs in successfully with a normalized email', async () => {
    await registerUser(context.app);
    const response = await request(context.app).post('/api/v1/auth/login').send({
      email: ' USER@EXAMPLE.COM ',
      password: PASSWORD,
    });
    const body = authResponseSchema.parse(responseBody(response));

    expect(response.status).toBe(200);
    expect(body.user.email).toBe('user@example.com');
  });

  it('returns generic invalid credentials for an incorrect password', async () => {
    await registerUser(context.app);
    const response = await request(context.app).post('/api/v1/auth/login').send({
      email: 'user@example.com',
      password: 'incorrect-password',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_CREDENTIALS_RESPONSE);
  });

  it('returns the same generic invalid credentials for a nonexistent email', async () => {
    const response = await request(context.app).post('/api/v1/auth/login').send({
      email: 'missing@example.com',
      password: 'incorrect-password',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_CREDENTIALS_RESPONSE);
  });

  it('rejects a protected route when the JWT is missing', async () => {
    const response = await request(context.app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      },
    });
  });

  it('rejects malformed and invalid JWTs', async () => {
    const malformedResponse = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'not-a-bearer-token');
    const invalidResponse = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');

    expect(malformedResponse.status).toBe(401);
    expect(invalidResponse.status).toBe(401);
    expect(malformedResponse.body).toEqual(invalidResponse.body);
    expect(invalidResponse.body).toEqual({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication token',
      },
    });
  });

  it('allows a valid JWT to access the current user', async () => {
    const registration = await registerUser(context.app);
    const { token, user: registeredUser } = authResponseSchema.parse(responseBody(registration));
    const response = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const body = meResponseSchema.parse(responseBody(response));

    expect(response.status).toBe(200);
    expect(body.user).toEqual(registeredUser);
  });

  it('never returns passwordHash from any authentication endpoint', async () => {
    const registration = await registerUser(context.app);
    const { token } = authResponseSchema.parse(responseBody(registration));
    const login = await request(context.app).post('/api/v1/auth/login').send({
      email: 'user@example.com',
      password: PASSWORD,
    });
    const currentUser = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(JSON.stringify(registration.body)).not.toContain('passwordHash');
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');
    expect(JSON.stringify(currentUser.body)).not.toContain('passwordHash');
  });
});
