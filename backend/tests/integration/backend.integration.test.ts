import { createServer, type Server as HttpServer } from 'node:http';

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { RealtimeRedisBridge } from '../../src/api/socket/realtime-bridge';
import {
  attachSocketServer,
  type RealtimeSocketServer,
} from '../../src/api/socket/socket-server';
import { AiAnalysisModel } from '../../src/database/models/ai-analysis';
import { CheckResultModel } from '../../src/database/models/check-result';
import { IncidentModel } from '../../src/database/models/incident';
import { MonitorModel, type MonitorDocument } from '../../src/database/models/monitor';
import { UserModel, type UserDocument } from '../../src/database/models/user';
import { MongooseAiAnalysisRepository } from '../../src/modules/ai/ai-analysis-repository';
import { AiContextBuilder } from '../../src/modules/ai/ai-context';
import type {
  IncidentAiResult,
  MonitorHealthAiResult,
} from '../../src/modules/ai/ai-contracts';
import { MongooseAiTelemetryRepository } from '../../src/modules/ai/ai-telemetry-repository';
import { AiProviderError, type AiProvider } from '../../src/modules/ai/ai-provider';
import { createAccessToken } from '../../src/modules/auth/jwt';
import {
  MongooseCheckResultRepository,
  type CreateCheckResultRecord,
} from '../../src/modules/checks/check-result-repository';
import {
  MongooseIncidentRepository,
  type OpenIncidentInput,
} from '../../src/modules/incidents/incident-repository';
import { MetricsService } from '../../src/modules/metrics/metrics.service';
import { MongooseMonitorRepository } from '../../src/modules/monitors/monitor-repository';
import { SafeHttpChecker } from '../../src/monitoring/http-checker';
import { UndiciHttpTransport } from '../../src/monitoring/http-transport';
import { BullMqAiAnalysisJobPublisher } from '../../src/queues/ai-analysis-publisher';
import { BullMqIncidentEvaluationPublisher } from '../../src/queues/incident-evaluation-publisher';
import {
  AI_ANALYSIS_JOB_NAME,
  createAiAnalysisJobId,
} from '../../src/queues/jobs/ai-analysis';
import { createIncidentEvaluationJobId } from '../../src/queues/jobs/incident-evaluation';
import {
  createProbeJobId,
  type ProbeJobPayload,
} from '../../src/queues/jobs/probe';
import {
  AI_ANALYSIS_QUEUE_NAME,
  INCIDENT_EVALUATION_QUEUE_NAME,
  probeQueueName,
} from '../../src/queues/names';
import { BullMqProbeJobPublisher } from '../../src/queues/probe-job-publisher';
import { realtimeChannelName } from '../../src/realtime/channel';
import type {
  CheckCompletedPayload,
  RealtimeDomainEvent,
} from '../../src/realtime/events';
import { RedisRealtimeEventPublisher } from '../../src/realtime/publisher';
import { SchedulerService } from '../../src/scheduler/scheduler.service';
import { AiAnalysisProcessor } from '../../src/workers/ai-analysis-processor';
import { createAiWorker, createAiWorkerDefinition } from '../../src/workers/ai.worker';
import { IncidentProcessor } from '../../src/workers/incident-processor';
import { ProbeProcessor } from '../../src/workers/probe-processor';
import {
  createProbeWorker,
  createProbeWorkerDefinition,
} from '../../src/workers/probe.worker';
import {
  clearIntegrationMongoData,
  clearOwnedRedisKeys,
  integrationMongoConnected,
  startIntegrationMongo,
  startIntegrationRedis,
  stopIntegrationInfrastructure,
  waitFor,
  type IntegrationInfrastructure,
} from './infrastructure';

const logger = pino({ enabled: false });
const JWT_CONFIGURATION = {
  secret: 'integration-test-secret-that-is-long-enough',
  expiresIn: '1h',
};
const REGIONS = ['mumbai', 'singapore', 'frankfurt'] as const;

interface MonitorOverrides {
  url?: string;
  regions?: string[];
  failureThreshold?: number;
  recoveryThreshold?: number;
  status?: 'pending' | 'healthy' | 'degraded' | 'down' | 'paused';
  nextCheckAt?: Date;
}

let infrastructure: IntegrationInfrastructure | undefined;
let redisStartupError: unknown;

async function seedUser(email: string): Promise<UserDocument> {
  return UserModel.create({
    name: 'Integration User',
    email,
    passwordHash: 'integration-only-password-hash',
  });
}

async function seedMonitor(
  user: UserDocument,
  overrides: MonitorOverrides = {},
): Promise<MonitorDocument> {
  return MonitorModel.create({
    userId: user._id,
    name: 'Integration Monitor',
    url: overrides.url ?? 'https://example.com/health',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 2_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 500,
    failureThreshold: overrides.failureThreshold ?? 2,
    recoveryThreshold: overrides.recoveryThreshold ?? 2,
    regions: overrides.regions ?? [...REGIONS],
    isPaused: false,
    status: overrides.status ?? 'pending',
    nextCheckAt: overrides.nextCheckAt ?? new Date('2026-01-01T00:00:00.000Z'),
    lastCheckedAt: null,
  });
}

function activeInfrastructure(): IntegrationInfrastructure {
  if (!infrastructure) {
    const reason = redisStartupError instanceof Error
      ? `: ${redisStartupError.message}`
      : '';
    throw new Error(`Real Redis integration is unavailable${reason}`);
  }

  return infrastructure;
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

beforeAll(async () => {
  await startIntegrationMongo();

  try {
    infrastructure = await startIntegrationRedis();
  } catch (error: unknown) {
    redisStartupError = error;
  }
});

beforeEach(async () => {
  await clearIntegrationMongoData();

  if (infrastructure) {
    await clearOwnedRedisKeys(infrastructure.redis, infrastructure.prefix);
  }
});

afterAll(async () => {
  if (integrationMongoConnected()) {
    await clearIntegrationMongoData();
  }
  await stopIntegrationInfrastructure(infrastructure);
});

describe('real MongoDB invariants', () => {
  it('creates the documented indexes in MongoDB', async () => {
    const [userIndexes, monitorIndexes, checkIndexes, incidentIndexes, aiIndexes] =
      await Promise.all([
        UserModel.collection.indexes(),
        MonitorModel.collection.indexes(),
        CheckResultModel.collection.indexes(),
        IncidentModel.collection.indexes(),
        AiAnalysisModel.collection.indexes(),
      ]);

    expect(userIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { email: 1 }, unique: true }),
      ]),
    );
    expect(monitorIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { userId: 1, createdAt: -1 } }),
        expect.objectContaining({ key: { isPaused: 1, nextCheckAt: 1 } }),
      ]),
    );
    expect(checkIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: { monitorId: 1, region: 1, scheduledAt: 1 },
          unique: true,
        }),
        expect.objectContaining({
          key: { userId: 1, monitorId: 1, scheduledAt: -1 },
        }),
        expect.objectContaining({
          key: { monitorId: 1, region: 1, scheduledAt: -1 },
        }),
      ]),
    );
    expect(incidentIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { userId: 1, monitorId: 1, openedAt: -1 } }),
        expect.objectContaining({
          key: { monitorId: 1 },
          unique: true,
          partialFilterExpression: { status: 'open' },
        }),
      ]),
    );
    expect(aiIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { userId: 1, createdAt: -1 } }),
        expect.objectContaining({ key: { monitorId: 1, createdAt: -1 } }),
        expect.objectContaining({ key: { incidentId: 1, createdAt: -1 } }),
      ]),
    );
  });

  it('enforces logical CheckResult identity, ObjectId ownership, and real aggregation', async () => {
    const owner = await seedUser('owner@example.com');
    const other = await seedUser('other@example.com');
    const monitor = await seedMonitor(owner);
    const monitorRepository = new MongooseMonitorRepository();
    const checkRepository = new MongooseCheckResultRepository();
    const scheduledAt = new Date('2026-01-01T00:00:00.000Z');
    const input: CreateCheckResultRecord = {
      userId: owner._id.toHexString(),
      monitorId: monitor._id.toHexString(),
      region: 'mumbai',
      scheduledAt,
      startedAt: scheduledAt,
      completedAt: new Date('2026-01-01T00:00:00.100Z'),
      success: true,
      statusCode: 200,
      latencyMs: 100,
      errorType: null,
    };

    const persisted = await Promise.all([
      checkRepository.saveIdempotently(input),
      checkRepository.saveIdempotently(input),
      checkRepository.saveIdempotently(input),
    ]);

    expect(new Set(persisted.map((result) => result.id))).toHaveLength(1);
    expect(await CheckResultModel.countDocuments({
      monitorId: monitor._id,
      region: 'mumbai',
      scheduledAt,
    })).toBe(1);
    await checkRepository.saveIdempotently({
      ...input,
      region: 'singapore',
      scheduledAt: new Date('2026-01-01T00:01:00.000Z'),
      success: false,
      statusCode: 503,
      latencyMs: 300,
      errorType: 'unexpected_status',
    });

    await expect(
      monitorRepository.findOwnedById(owner._id.toHexString(), monitor._id.toHexString()),
    ).resolves.toMatchObject({ id: monitor._id.toHexString() });
    await expect(
      monitorRepository.findOwnedById(other._id.toHexString(), monitor._id.toHexString()),
    ).resolves.toBeNull();

    const summary = await checkRepository.summarizeOwnedRange({
      userId: owner._id.toHexString(),
      monitorId: monitor._id.toHexString(),
      from: new Date('2025-12-31T23:59:00.000Z'),
      to: new Date('2026-01-01T00:02:00.000Z'),
    });

    expect(summary).toEqual(
      expect.arrayContaining([
        {
          region: 'mumbai',
          totalChecks: 1,
          successfulChecks: 1,
          latencySampleCount: 1,
          latencyTotalMs: 100,
        },
        {
          region: 'singapore',
          totalChecks: 1,
          successfulChecks: 0,
          latencySampleCount: 1,
          latencyTotalMs: 300,
        },
      ]),
    );
  });

  it('allows exactly one open incident during a real duplicate-key race', async () => {
    const owner = await seedUser('incident-owner@example.com');
    const monitor = await seedMonitor(owner);
    const repository = new MongooseIncidentRepository();
    const input: OpenIncidentInput = {
      userId: owner._id.toHexString(),
      monitorId: monitor._id.toHexString(),
      openedAt: new Date('2026-01-01T00:00:00.000Z'),
      triggerReason: 'regional_failure_consensus',
      openingStatusEvidence: {
        requiredConsensus: 2,
        failureThreshold: 2,
        regions: [
          { region: 'mumbai', consecutiveFailures: 2, latestErrorType: 'timeout' },
          { region: 'singapore', consecutiveFailures: 2, latestErrorType: 'timeout' },
        ],
      },
    };

    const attempts = await Promise.all(
      Array.from({ length: 5 }, async () => repository.openIdempotently(input)),
    );

    expect(attempts.filter((attempt) => attempt.created)).toHaveLength(1);
    expect(new Set(attempts.map((attempt) => attempt.incident.id))).toHaveLength(1);
    expect(await IncidentModel.countDocuments({
      monitorId: monitor._id,
      status: 'open',
    })).toBe(1);
  });
});

describe('real Redis and BullMQ monitoring path', () => {
  it('schedules deterministic regional jobs and runs a probe through durable handoff', async () => {
    const current = activeInfrastructure();
    const httpServer = createServer((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Local integration server did not expose a TCP port');
    }

    const dueAt = new Date('2026-01-01T00:00:00.000Z');
    const tickAt = new Date('2026-01-01T00:00:10.000Z');
    const owner = await seedUser('scheduler-owner@example.com');
    const monitor = await seedMonitor(owner, {
      url: `http://127.0.0.1:${String(address.port)}/health`,
      nextCheckAt: dueAt,
    });
    const monitorRepository = new MongooseMonitorRepository();
    const probePublisher = new BullMqProbeJobPublisher(
      REGIONS,
      current.redis,
      current.prefix,
    );
    const scheduler = new SchedulerService(monitorRepository, probePublisher, logger);
    const regionalQueues = REGIONS.map(
      (region) => new Queue(probeQueueName(region), {
        connection: current.redis,
        prefix: current.prefix,
      }),
    );
    const incidentQueue = new Queue(INCIDENT_EVALUATION_QUEUE_NAME, {
      connection: current.redis,
      prefix: current.prefix,
    });
    const incidentPublisher = new BullMqIncidentEvaluationPublisher(
      current.redis,
      current.prefix,
    );
    let probeWorker: ReturnType<typeof createProbeWorker> | undefined;

    try {
      await scheduler.runTick(tickAt);

      for (const [index, region] of REGIONS.entries()) {
        const payload: ProbeJobPayload = {
          monitorId: monitor._id.toHexString(),
          userId: owner._id.toHexString(),
          region,
          scheduledAt: dueAt.toISOString(),
        };
        const job = await regionalQueues[index]?.getJob(createProbeJobId(payload));
        expect(job?.data).toEqual(payload);
        expect(job?.opts.attempts).toBe(3);
        expect(job?.opts.backoff).toEqual({ type: 'exponential', delay: 1_000 });
      }

      const advanced = await MonitorModel.findById(monitor._id).lean().exec();
      expect(advanced?.nextCheckAt).toEqual(
        new Date(tickAt.getTime() + monitor.intervalSeconds * 1_000),
      );
      await scheduler.runTick(tickAt);

      for (const queue of regionalQueues) {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(1);
      }

      const checkRepository = new MongooseCheckResultRepository();
      const processor = new ProbeProcessor(
        'mumbai',
        monitorRepository,
        checkRepository,
        new SafeHttpChecker({
          globalTimeoutMs: 2_000,
          maxResponseBodyBytes: 64 * 1_024,
          allowPrivateNetworkTargets: true,
          transport: new UndiciHttpTransport(),
        }),
        incidentPublisher,
        logger,
      );
      probeWorker = createProbeWorker(
        createProbeWorkerDefinition('mumbai', 1, current.prefix),
        current.redis,
        processor,
        logger,
      );
      await probeWorker.waitUntilReady();

      const persisted = await waitFor(
        async () => CheckResultModel.findOne({
          monitorId: monitor._id,
          region: 'mumbai',
          scheduledAt: dueAt,
        }).lean().exec(),
        (result) => result !== null,
      );
      expect(persisted).toMatchObject({ success: true, statusCode: 200 });

      const incidentJobId = createIncidentEvaluationJobId({
        checkResultId: persisted?._id.toHexString() ?? '',
      });
      const incidentJob = await incidentQueue.getJob(incidentJobId);
      expect(incidentJob?.data).toEqual({
        checkResultId: persisted?._id.toHexString(),
      });
      expect(incidentJob?.opts.attempts).toBe(3);
      expect(incidentJob?.opts.backoff).toEqual({ type: 'exponential', delay: 1_000 });

      await processor.process({
        monitorId: monitor._id.toHexString(),
        userId: owner._id.toHexString(),
        region: 'mumbai',
        scheduledAt: dueAt.toISOString(),
      });
      expect(await CheckResultModel.countDocuments({
        monitorId: monitor._id,
        region: 'mumbai',
        scheduledAt: dueAt,
      })).toBe(1);
    } finally {
      if (probeWorker) await probeWorker.close();
      await incidentPublisher.close();
      await probePublisher.close();
      await incidentQueue.close();
      await Promise.all(regionalQueues.map(async (queue) => queue.close()));
      await closeHttpServer(httpServer);
    }
  });

  it('converges degraded, open, and resolved incident state under replay', async () => {
    const owner = await seedUser('health-owner@example.com');
    const monitor = await seedMonitor(owner, {
      failureThreshold: 2,
      recoveryThreshold: 2,
    });
    const checkRepository = new MongooseCheckResultRepository();
    const incidentRepository = new MongooseIncidentRepository();
    const processor = new IncidentProcessor(
      checkRepository,
      new MongooseMonitorRepository(),
      incidentRepository,
      logger,
    );
    let sequence = 0;

    const persist = async (region: string, success: boolean) => {
      sequence += 1;
      const scheduledAt = new Date(Date.UTC(2026, 0, 1, 0, sequence, 0));
      return checkRepository.saveIdempotently({
        userId: owner._id.toHexString(),
        monitorId: monitor._id.toHexString(),
        region,
        scheduledAt,
        startedAt: scheduledAt,
        completedAt: new Date(scheduledAt.getTime() + 100),
        success,
        statusCode: success ? 200 : null,
        latencyMs: success ? 100 : null,
        errorType: success ? null : 'timeout',
        ...(success ? {} : { errorMetadata: { code: 'TIMEOUT' } }),
      });
    };
    const process = async (region: string, success: boolean) => {
      const result = await persist(region, success);
      await processor.process({ checkResultId: result.id });
      return result;
    };

    await persist('mumbai', true);
    await persist('singapore', true);
    const initial = await process('frankfurt', true);
    expect((await MonitorModel.findById(monitor._id).lean().exec())?.status).toBe('healthy');

    await process('mumbai', false);
    await process('mumbai', false);
    expect((await MonitorModel.findById(monitor._id).lean().exec())?.status).toBe('degraded');
    expect(await IncidentModel.countDocuments({ monitorId: monitor._id })).toBe(0);

    await process('singapore', false);
    const thresholdResult = await persist('singapore', false);
    await Promise.all([
      processor.process({ checkResultId: thresholdResult.id }),
      processor.process({ checkResultId: thresholdResult.id }),
      processor.process({ checkResultId: thresholdResult.id }),
    ]);

    const opened = await IncidentModel.findOne({ monitorId: monitor._id }).lean().exec();
    expect(opened).toMatchObject({ status: 'open' });
    expect(await IncidentModel.countDocuments({ monitorId: monitor._id, status: 'open' })).toBe(1);
    expect((await MonitorModel.findById(monitor._id).lean().exec())?.status).toBe('down');

    await process('mumbai', true);
    await process('mumbai', true);
    await process('singapore', true);
    const recovered = await process('singapore', true);
    await processor.process({ checkResultId: recovered.id });

    const resolved = await IncidentModel.findById(opened?._id).lean().exec();
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.events).toHaveLength(2);
    expect((await MonitorModel.findById(monitor._id).lean().exec())?.status).toBe('healthy');
    expect(await IncidentModel.countDocuments({ monitorId: monitor._id })).toBe(1);
    expect(initial.id).toMatch(/^[a-f\d]{24}$/i);
  });
});

describe('real Redis Pub/Sub to authenticated Socket.IO', () => {
  it('delivers only to the owning user and survives malformed Pub/Sub input', async () => {
    const current = activeInfrastructure();
    const owner = await seedUser('socket-owner@example.com');
    const other = await seedUser('socket-other@example.com');
    const monitor = await seedMonitor(owner);
    const httpServer = createServer((_request, response) => {
      response.statusCode = 204;
      response.end();
    });
    const socketServer: RealtimeSocketServer = attachSocketServer(
      httpServer,
      'http://client.example.com',
      JWT_CONFIGURATION,
    );
    const subscriber = new Redis(current.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    const clients: ClientSocket[] = [];
    const channel = realtimeChannelName(current.prefix);
    const bridge = new RealtimeRedisBridge(subscriber, channel, socketServer, logger);

    try {
      await subscriber.connect();
      await bridge.start();
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', resolve);
      });
      const address = httpServer.address();

      if (!address || typeof address === 'string') {
        throw new Error('Socket integration server did not expose a TCP port');
      }

      const url = `http://127.0.0.1:${String(address.port)}`;
      const clientFor = (userId: string): ClientSocket => {
        const client = createSocketClient(url, {
          auth: { token: createAccessToken(userId, JWT_CONFIGURATION) },
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
        });
        clients.push(client);
        return client;
      };
      const ownerClient = clientFor(owner._id.toHexString());
      const otherClient = clientFor(other._id.toHexString());
      await Promise.all(
        [ownerClient, otherClient].map(
          async (client) => new Promise<void>((resolve, reject) => {
            client.once('connect', resolve);
            client.once('connect_error', reject);
          }),
        ),
      );

      let otherEventCount = 0;
      otherClient.on('check.completed', () => {
        otherEventCount += 1;
      });
      const received = new Promise<CheckCompletedPayload>((resolve) => {
        ownerClient.once('check.completed', resolve);
      });
      const event: RealtimeDomainEvent = {
        version: 1,
        eventId: 'check:000000000000000000000099',
        userId: owner._id.toHexString(),
        type: 'check.completed',
        occurredAt: '2026-01-01T00:00:01.000Z',
        payload: {
          checkResultId: '000000000000000000000099',
          monitorId: monitor._id.toHexString(),
          region: 'mumbai',
          scheduledAt: '2026-01-01T00:00:00.000Z',
          success: true,
          statusCode: 200,
          latencyMs: 50,
          errorType: null,
        },
      };

      await current.redis.publish(channel, '{malformed-json');
      await new RedisRealtimeEventPublisher(current.redis, channel).publish(event);

      await expect(received).resolves.toEqual(event.payload);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
      expect(otherEventCount).toBe(0);
    } finally {
      for (const client of clients) client.disconnect();
      await bridge.stop();
      await subscriber.quit();
      await socketServer.close();
      await closeHttpServer(httpServer);
    }
  });
});

describe('real BullMQ AI lifecycle with a fake provider', () => {
  it('completes and fails durable analyses without an OpenAI request', async () => {
    const current = activeInfrastructure();
    const owner = await seedUser('ai-owner@example.com');
    const monitor = await seedMonitor(owner);
    const analysisRepository = new MongooseAiAnalysisRepository();
    const monitorRepository = new MongooseMonitorRepository();
    const incidentRepository = new MongooseIncidentRepository();
    const checkRepository = new MongooseCheckResultRepository();
    const contextBuilder = new AiContextBuilder(
      monitorRepository,
      incidentRepository,
      new MetricsService(checkRepository, incidentRepository, monitorRepository),
      new MongooseAiTelemetryRepository(),
    );
    const monitorResult: MonitorHealthAiResult = {
      summary: 'No failures were observed in the supplied window.',
      observations: ['The bounded window contains no failed checks.'],
      regionalFindings: [],
      latencyFindings: [],
      reliabilityRisk: 'unknown',
      caveats: ['An empty window cannot establish long-term reliability.'],
    };
    const incidentResult: IncidentAiResult = {
      summary: 'Not used by this integration case.',
      timelineSummary: 'Not used.',
      affectedRegions: [],
      likelyPattern: 'Not used.',
      evidence: [],
      caveats: ['Not used.'],
    };
    const analyzeMonitorHealth = vi
      .fn<AiProvider['analyzeMonitorHealth']>()
      .mockResolvedValue(monitorResult);
    const provider: AiProvider = {
      analyzeMonitorHealth,
      summarizeIncident: vi.fn<AiProvider['summarizeIncident']>().mockResolvedValue(incidentResult),
    };
    const processor = new AiAnalysisProcessor(
      analysisRepository,
      contextBuilder,
      provider,
      logger,
    );
    const worker = createAiWorker(
      createAiWorkerDefinition(current.prefix),
      current.redis,
      processor,
      logger,
    );
    const publisher = new BullMqAiAnalysisJobPublisher(current.redis, current.prefix);
    const rawQueue = new Queue(AI_ANALYSIS_QUEUE_NAME, {
      connection: current.redis,
      prefix: current.prefix,
    });

    try {
      await worker.waitUntilReady();
      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-01-01T01:00:00.000Z');
      const completedAnalysis = await analysisRepository.createQueued({
        userId: owner._id.toHexString(),
        type: 'monitor_health',
        monitorId: monitor._id.toHexString(),
        incidentId: null,
        inputWindow: { from, to },
      });
      const published = await publisher.enqueue({ analysisId: completedAnalysis.id });
      expect(published.jobId).toBe(createAiAnalysisJobId({
        analysisId: completedAnalysis.id,
      }));
      const queued = await rawQueue.getJob(published.jobId);
      expect(queued?.opts.attempts).toBe(2);
      expect(queued?.opts.backoff).toEqual({ type: 'exponential', delay: 2_000 });

      const completed = await waitFor(
        async () => analysisRepository.findById(completedAnalysis.id),
        (analysis) => analysis?.status === 'completed',
      );
      expect(completed).toMatchObject({ status: 'completed', result: monitorResult });

      analyzeMonitorHealth.mockRejectedValueOnce(
        new AiProviderError('AI_PROVIDER_ERROR', false),
      );
      const failedAnalysis = await analysisRepository.createQueued({
        userId: owner._id.toHexString(),
        type: 'monitor_health',
        monitorId: monitor._id.toHexString(),
        incidentId: null,
        inputWindow: { from, to },
      });
      await publisher.enqueue({ analysisId: failedAnalysis.id });
      const failed = await waitFor(
        async () => analysisRepository.findById(failedAnalysis.id),
        (analysis) => analysis?.status === 'failed',
      );
      expect(failed).toMatchObject({
        status: 'failed',
        result: null,
        failureCode: 'AI_PROVIDER_ERROR',
      });

      const malformed = await rawQueue.add(
        AI_ANALYSIS_JOB_NAME,
        { analysisId: 'not-an-object-id' },
        {
          jobId: 'integration-invalid-ai-payload',
          attempts: 2,
          backoff: { type: 'exponential', delay: 2_000 },
        },
      );
      await waitFor(
        async () => malformed.getState(),
        (state) => state === 'failed',
      );
      const failedJob = await rawQueue.getJob(malformed.id ?? '');
      expect(failedJob?.attemptsMade).toBe(1);
      expect(analyzeMonitorHealth).toHaveBeenCalledTimes(2);
    } finally {
      await worker.close();
      await publisher.close();
      await rawQueue.close();
    }
  });
});
