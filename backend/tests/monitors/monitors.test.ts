import pino from 'pino';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/api/app';
import { createAccessToken } from '../../src/modules/auth/jwt';
import type {
  CreateMonitorRecord,
  MonitorRecord,
  MonitorRepository,
  UpdateMonitorRecord,
} from '../../src/modules/monitors/monitor-repository';

const JWT_SECRET = 'a-test-secret-that-is-long-enough';
const OWNER_ID = '000000000000000000000001';
const OTHER_USER_ID = '000000000000000000000002';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-01-01T00:05:00.000Z');

const validMonitorBody = {
  name: 'Production API',
  url: 'https://API.Example.com:443/health',
  method: 'GET',
  intervalSeconds: 60,
  timeoutMs: 5_000,
  expectedStatusCodes: [200, 204],
  latencyThresholdMs: 800,
  failureThreshold: 3,
  recoveryThreshold: 2,
  regions: ['mumbai', 'singapore'],
};

const monitorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  url: z.string(),
  method: z.enum(['GET', 'HEAD']),
  intervalSeconds: z.number(),
  timeoutMs: z.number(),
  expectedStatusCodes: z.array(z.number()),
  latencyThresholdMs: z.number(),
  failureThreshold: z.number(),
  recoveryThreshold: z.number(),
  regions: z.array(z.string()),
  isPaused: z.boolean(),
  status: z.enum(['pending', 'healthy', 'degraded', 'down', 'paused']),
  nextCheckAt: z.string(),
  lastCheckedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const monitorResponseSchema = z.object({ monitor: monitorSchema });
const monitorListResponseSchema = z.object({ monitors: z.array(monitorSchema) });

function cloneMonitor(monitor: MonitorRecord): MonitorRecord {
  return {
    ...monitor,
    expectedStatusCodes: [...monitor.expectedStatusCodes],
    regions: [...monitor.regions],
    nextCheckAt: new Date(monitor.nextCheckAt),
    lastCheckedAt: monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt) : null,
    createdAt: new Date(monitor.createdAt),
    updatedAt: new Date(monitor.updatedAt),
  };
}

class InMemoryMonitorRepository implements MonitorRepository {
  private readonly monitors = new Map<string, MonitorRecord>();
  private nextId = 1;

  public create(input: CreateMonitorRecord): Promise<MonitorRecord> {
    const monitor: MonitorRecord = {
      ...input,
      id: this.nextId.toString(16).padStart(24, '0'),
      expectedStatusCodes: [...input.expectedStatusCodes],
      regions: [...input.regions],
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.nextId += 1;
    this.monitors.set(monitor.id, monitor);
    return Promise.resolve(cloneMonitor(monitor));
  }

  public listByUser(userId: string): Promise<MonitorRecord[]> {
    const monitors = [...this.monitors.values()]
      .filter((monitor) => monitor.userId === userId)
      .map(cloneMonitor);
    return Promise.resolve(monitors);
  }

  public findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null> {
    const monitor = this.monitors.get(monitorId);
    return Promise.resolve(monitor?.userId === userId ? cloneMonitor(monitor) : null);
  }

  public updateOwnedById(
    userId: string,
    monitorId: string,
    update: UpdateMonitorRecord,
  ): Promise<MonitorRecord | null> {
    const monitor = this.monitors.get(monitorId);

    if (!monitor || monitor.userId !== userId) {
      return Promise.resolve(null);
    }

    const updatedMonitor: MonitorRecord = {
      ...monitor,
      ...update,
      expectedStatusCodes: update.expectedStatusCodes
        ? [...update.expectedStatusCodes]
        : monitor.expectedStatusCodes,
      regions: update.regions ? [...update.regions] : monitor.regions,
      updatedAt: NOW,
    };
    this.monitors.set(monitorId, updatedMonitor);
    return Promise.resolve(cloneMonitor(updatedMonitor));
  }

  public deleteOwnedById(userId: string, monitorId: string): Promise<boolean> {
    const monitor = this.monitors.get(monitorId);

    if (!monitor || monitor.userId !== userId) {
      return Promise.resolve(false);
    }

    return Promise.resolve(this.monitors.delete(monitorId));
  }
}

function responseBody(response: Response): unknown {
  return response.body as unknown;
}

function tokenFor(userId: string): string {
  return createAccessToken(userId, { secret: JWT_SECRET, expiresIn: '7d' });
}

function createTestContext(): {
  app: ReturnType<typeof createApp>;
  repository: InMemoryMonitorRepository;
  setClock: (value: Date) => void;
} {
  const repository = new InMemoryMonitorRepository();
  let currentTime = NOW;
  const app = createApp({
    logger: pino({ enabled: false }),
    isProduction: false,
    clientOrigin: 'http://client.example.com',
    auth: { secret: JWT_SECRET, expiresIn: '7d' },
    monitors: {
      enabledRegions: ['mumbai', 'singapore', 'frankfurt'],
      monitorRepository: repository,
      clock: () => currentTime,
    },
  });

  return {
    app,
    repository,
    setClock(value: Date) {
      currentTime = value;
    },
  };
}

function authenticatedRequest(
  app: ReturnType<typeof createApp>,
  method: 'post' | 'get' | 'patch' | 'delete',
  path: string,
  userId = OWNER_ID,
): request.Test {
  return request(app)[method](path).set('Authorization', `Bearer ${tokenFor(userId)}`);
}

async function createMonitor(
  app: ReturnType<typeof createApp>,
  userId = OWNER_ID,
): Promise<Response> {
  return authenticatedRequest(app, 'post', '/api/v1/monitors', userId).send(validMonitorBody);
}

function expectValidationError(response: Response): void {
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
  });
}

function expectMonitorNotFound(response: Response): void {
  expect(response.status).toBe(404);
  expect(response.body).toEqual({
    error: { code: 'MONITOR_NOT_FOUND', message: 'Monitor not found' },
  });
}

describe('monitor API', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
  });

  it('rejects unauthenticated monitor requests', async () => {
    const listResponse = await request(context.app).get('/api/v1/monitors');
    const createResponse = await request(context.app).post('/api/v1/monitors').send(validMonitorBody);

    expect(listResponse.status).toBe(401);
    expect(createResponse.status).toBe(401);
    expect(listResponse.body).toEqual({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required' },
    });
  });

  it('creates an owned monitor with normalized URL and predictable initial state', async () => {
    const response = await createMonitor(context.app);
    const { monitor } = monitorResponseSchema.parse(responseBody(response));
    const storedMonitor = await context.repository.findOwnedById(OWNER_ID, monitor.id);

    expect(response.status).toBe(201);
    expect(monitor).toMatchObject({
      userId: OWNER_ID,
      name: 'Production API',
      url: 'https://api.example.com/health',
      isPaused: false,
      status: 'pending',
      nextCheckAt: NOW.toISOString(),
      lastCheckedAt: null,
    });
    expect(storedMonitor?.userId).toBe(OWNER_ID);
  });

  it.each([
    ['malformed URL', { url: 'not a URL' }],
    ['non-HTTP URL', { url: 'ftp://example.com/health' }],
    ['URL credentials', { url: 'https://user:secret@example.com/health' }],
    ['unsupported method', { method: 'POST' }],
  ])('rejects %s', async (_caseName, override) => {
    const response = await authenticatedRequest(context.app, 'post', '/api/v1/monitors').send({
      ...validMonitorBody,
      ...override,
    });

    expectValidationError(response);
  });

  it.each([
    ['an unknown region', ['moon']],
    ['an empty region list', []],
    ['duplicate regions', ['mumbai', 'mumbai']],
  ])('rejects %s', async (_caseName, regions) => {
    const response = await authenticatedRequest(context.app, 'post', '/api/v1/monitors').send({
      ...validMonitorBody,
      regions,
    });

    expectValidationError(response);
  });

  it.each([
    ['interval below the minimum', { intervalSeconds: 9 }],
    ['interval above the maximum', { intervalSeconds: 86_401 }],
    ['timeout below the minimum', { timeoutMs: 99 }],
    ['timeout above the maximum', { timeoutMs: 30_001 }],
    ['empty expected statuses', { expectedStatusCodes: [] }],
    ['out-of-range expected status', { expectedStatusCodes: [99] }],
    ['duplicate expected statuses', { expectedStatusCodes: [200, 200] }],
    ['invalid failure threshold', { failureThreshold: 0 }],
    ['invalid recovery threshold', { recoveryThreshold: 11 }],
    ['invalid latency threshold', { latencyThresholdMs: 60_001 }],
  ])('rejects %s', async (_caseName, override) => {
    const response = await authenticatedRequest(context.app, 'post', '/api/v1/monitors').send({
      ...validMonitorBody,
      ...override,
    });

    expectValidationError(response);
  });

  it('lists only the authenticated user monitors', async () => {
    await createMonitor(context.app, OWNER_ID);
    await createMonitor(context.app, OTHER_USER_ID);

    const response = await authenticatedRequest(context.app, 'get', '/api/v1/monitors');
    const { monitors } = monitorListResponseSchema.parse(responseBody(response));

    expect(response.status).toBe(200);
    expect(monitors).toHaveLength(1);
    expect(monitors[0]?.userId).toBe(OWNER_ID);
  });

  it('returns an owned monitor and conceals a foreign-owned monitor', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;

    const ownedResponse = await authenticatedRequest(
      context.app,
      'get',
      `/api/v1/monitors/${monitorId}`,
    );
    const foreignResponse = await authenticatedRequest(
      context.app,
      'get',
      `/api/v1/monitors/${monitorId}`,
      OTHER_USER_ID,
    );

    expect(ownedResponse.status).toBe(200);
    expectMonitorNotFound(foreignResponse);
  });

  it('updates only documented configuration on an owned active monitor and reschedules it', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;
    context.setClock(LATER);
    const response = await authenticatedRequest(
      context.app,
      'patch',
      `/api/v1/monitors/${monitorId}`,
    ).send({ name: 'Updated API', method: 'HEAD', regions: ['frankfurt'] });
    const { monitor } = monitorResponseSchema.parse(responseBody(response));

    expect(response.status).toBe(200);
    expect(monitor).toMatchObject({
      name: 'Updated API',
      method: 'HEAD',
      regions: ['frankfurt'],
      nextCheckAt: LATER.toISOString(),
      status: 'pending',
    });
  });

  it('rejects attempts to update system-managed fields', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;
    const response = await authenticatedRequest(
      context.app,
      'patch',
      `/api/v1/monitors/${monitorId}`,
    ).send({
      userId: OTHER_USER_ID,
      status: 'down',
      lastCheckedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    });

    expectValidationError(response);
  });

  it('rejects an update to another user monitor without revealing ownership', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;
    const response = await authenticatedRequest(
      context.app,
      'patch',
      `/api/v1/monitors/${monitorId}`,
      OTHER_USER_ID,
    ).send({ name: 'Stolen monitor' });

    expectMonitorNotFound(response);
  });

  it('deletes an owned monitor', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;
    const response = await authenticatedRequest(
      context.app,
      'delete',
      `/api/v1/monitors/${monitorId}`,
    );

    expect(response.status).toBe(204);
    await expect(context.repository.findOwnedById(OWNER_ID, monitorId)).resolves.toBeNull();
  });

  it('rejects deletion of another user monitor', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;
    const response = await authenticatedRequest(
      context.app,
      'delete',
      `/api/v1/monitors/${monitorId}`,
      OTHER_USER_ID,
    );

    expectMonitorNotFound(response);
    await expect(context.repository.findOwnedById(OWNER_ID, monitorId)).resolves.not.toBeNull();
  });

  it('pauses and resumes an owned monitor with predictable state', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;
    const pauseResponse = await authenticatedRequest(
      context.app,
      'post',
      `/api/v1/monitors/${monitorId}/pause`,
    );
    const pausedMonitor = monitorResponseSchema.parse(responseBody(pauseResponse)).monitor;
    context.setClock(LATER);
    const resumeResponse = await authenticatedRequest(
      context.app,
      'post',
      `/api/v1/monitors/${monitorId}/resume`,
    );
    const resumedMonitor = monitorResponseSchema.parse(responseBody(resumeResponse)).monitor;

    expect(pausedMonitor).toMatchObject({ isPaused: true, status: 'paused' });
    expect(resumedMonitor).toMatchObject({
      isPaused: false,
      status: 'pending',
      nextCheckAt: LATER.toISOString(),
    });
  });

  it('rejects another user pausing or resuming a monitor', async () => {
    const creation = await createMonitor(context.app);
    const monitorId = monitorResponseSchema.parse(responseBody(creation)).monitor.id;
    const pauseResponse = await authenticatedRequest(
      context.app,
      'post',
      `/api/v1/monitors/${monitorId}/pause`,
      OTHER_USER_ID,
    );
    const resumeResponse = await authenticatedRequest(
      context.app,
      'post',
      `/api/v1/monitors/${monitorId}/resume`,
      OTHER_USER_ID,
    );

    expectMonitorNotFound(pauseResponse);
    expectMonitorNotFound(resumeResponse);
  });
});
