import { AppError } from '../../shared/errors/app-error';
import type { LoginInput, RegisterInput } from './auth.schemas';
import { createAccessToken, type JwtConfiguration } from './jwt';
import { hashPassword, verifyPasswordOrDummy } from './password';
import type { UserProfile, UserRepository } from './user-repository';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticationResult {
  token: string;
  user: SafeUser;
}

function toSafeUser(user: UserProfile): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

function duplicateEmailError(): AppError {
  return new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists');
}

function invalidCredentialsError(): AppError {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
}

export class AuthService {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtConfiguration: JwtConfiguration,
  ) {}

  public async register(input: RegisterInput): Promise<AuthenticationResult> {
    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw duplicateEmailError();
    }

    const passwordHash = await hashPassword(input.password);
    let user: UserProfile;

    try {
      user = await this.userRepository.create({
        name: input.name,
        email: input.email,
        passwordHash,
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw duplicateEmailError();
      }

      throw error;
    }

    return {
      token: createAccessToken(user.id, this.jwtConfiguration),
      user: toSafeUser(user),
    };
  }

  public async login(input: LoginInput): Promise<AuthenticationResult> {
    const user = await this.userRepository.findByEmail(input.email);
    const passwordMatches = await verifyPasswordOrDummy(user?.passwordHash, input.password);

    if (!user || !passwordMatches) {
      throw invalidCredentialsError();
    }

    return {
      token: createAccessToken(user.id, this.jwtConfiguration),
      user: toSafeUser(user),
    };
  }

  public async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token');
    }

    return toSafeUser(user);
  }
}
