import { UnrecoverableError, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import pino, { type Logger } from 'pino';

import { getEnvironment, type Environment } from '../config/env';
import { createLogger } from '../config/logger';
import { connectMongo, disconnectMongo } from '../database/mongo';
import { MongooseAiAnalysisRepository } from '../modules/ai/ai-analysis-repository';
import { AiContextBuilder } from '../modules/ai/ai-context';
import { MongooseAiTelemetryRepository } from '../modules/ai/ai-telemetry-repository';
import { OpenAiProvider } from '../modules/ai/ai-provider';
import { MongooseCheckResultRepository } from '../modules/checks/check-result-repository';
import { MongooseIncidentRepository } from '../modules/incidents/incident-repository';
import { MetricsService } from '../modules/metrics/metrics.service';
import { MongooseMonitorRepository } from '../modules/monitors/monitor-repository';
import {
  connectRedis,
  createRedisConnection,
  disconnectRedis,
} from '../queues/connection';
import {
  AI_ANALYSIS_JOB_NAME,
  type AiAnalysisJobPayload,
} from '../queues/jobs/ai-analysis';
import { AI_ANALYSIS_QUEUE_NAME } from '../queues/names';
import { realtimeChannelName } from '../realtime/channel';
import { RedisRealtimeEventPublisher } from '../realtime/publisher';
import {
  AiAnalysisProcessor,
  PermanentAiJobError,
  type AiProcessingOutcome,
} from './ai-analysis-processor';

export const AI_WORKER_CONCURRENCY = 2;

export interface AiWorkerDefinition {
  queueName: typeof AI_ANALYSIS_QUEUE_NAME;
  concurrency: typeof AI_WORKER_CONCURRENCY;
  prefix: string;
}

type EnabledAiEnvironment = Environment & {
  AI_ENABLED: true;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  AI_REQUEST_TIMEOUT_MS: number;
};

function enabledAiEnvironment(environment: Environment): EnabledAiEnvironment {
  if (
    !environment.AI_ENABLED ||
    !environment.OPENAI_API_KEY ||
    !environment.OPENAI_MODEL ||
    environment.AI_REQUEST_TIMEOUT_MS === undefined
  ) {
    throw new Error('Enabled AI configuration was not validated');
  }

  return environment as EnabledAiEnvironment;
}

export function createAiWorkerDefinition(prefix: string): AiWorkerDefinition {
  return {
    queueName: AI_ANALYSIS_QUEUE_NAME,
    concurrency: AI_WORKER_CONCURRENCY,
    prefix,
  };
}

export function createAiWorker(
  definition: AiWorkerDefinition,
  connection: Redis,
  processor: AiAnalysisProcessor,
  logger: Logger,
): Worker<AiAnalysisJobPayload, AiProcessingOutcome> {
  const worker = new Worker<AiAnalysisJobPayload, AiProcessingOutcome>(
    definition.queueName,
    async (job: Job<AiAnalysisJobPayload, AiProcessingOutcome>) => {
      if (job.name !== AI_ANALYSIS_JOB_NAME) {
        throw new UnrecoverableError('Unsupported job name on ai-analysis queue');
      }

      try {
        return await processor.process(job.data, {
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts ?? 1,
        });
      } catch (error: unknown) {
        if (error instanceof PermanentAiJobError) {
          throw new UnrecoverableError(error.message);
        }

        throw error;
      }
    },
    {
      connection,
      prefix: definition.prefix,
      concurrency: definition.concurrency,
    },
  );

  worker.on('completed', (job, outcome) => {
    logger.debug({ jobId: job.id, analysisId: job.data.analysisId, outcome }, 'AI job completed');
  });
  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, analysisId: job?.data.analysisId },
      'AI job failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ err: error }, 'AI worker error');
  });

  return worker;
}

async function waitForShutdown(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

async function runAiWorker(
  environment: EnabledAiEnvironment,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  const redisConnection = createRedisConnection(environment.REDIS_URL, logger);
  let worker: Worker<AiAnalysisJobPayload, AiProcessingOutcome> | undefined;

  try {
    await connectMongo(environment.MONGODB_URI, logger);
    await connectRedis(redisConnection, logger);

    const monitorRepository = new MongooseMonitorRepository();
    const incidentRepository = new MongooseIncidentRepository();
    const checkResultRepository = new MongooseCheckResultRepository();
    const metricsService = new MetricsService(
      checkResultRepository,
      incidentRepository,
      monitorRepository,
    );
    const contextBuilder = new AiContextBuilder(
      monitorRepository,
      incidentRepository,
      metricsService,
      new MongooseAiTelemetryRepository(),
    );
    const provider = new OpenAiProvider({
      apiKey: environment.OPENAI_API_KEY,
      model: environment.OPENAI_MODEL,
      timeoutMs: environment.AI_REQUEST_TIMEOUT_MS,
    });
    const realtimePublisher = new RedisRealtimeEventPublisher(
      redisConnection,
      realtimeChannelName(environment.BULLMQ_PREFIX),
    );
    const processor = new AiAnalysisProcessor(
      new MongooseAiAnalysisRepository(),
      contextBuilder,
      provider,
      logger,
      realtimePublisher,
    );
    const definition = createAiWorkerDefinition(environment.BULLMQ_PREFIX);
    worker = createAiWorker(definition, redisConnection, processor, logger);
    await worker.waitUntilReady();
    logger.info(
      { queueName: definition.queueName, concurrency: definition.concurrency },
      'Sentinel AI worker started',
    );
    await waitForShutdown(signal);
  } finally {
    if (worker) {
      try {
        await worker.close();
      } catch (error: unknown) {
        logger.error({ err: error }, 'Failed to close AI worker cleanly');
      }
    }

    await disconnectRedis(redisConnection, logger);
    await disconnectMongo(logger);
    logger.info('Sentinel AI worker stopped');
  }
}

async function main(): Promise<void> {
  let environment: Environment;
  let logger: Logger;

  try {
    environment = getEnvironment();
    logger = createLogger(environment);
  } catch (error: unknown) {
    const bootstrapLogger = pino({ level: 'error', base: { service: 'sentinel-backend' } });
    bootstrapLogger.fatal({ err: error }, 'Sentinel AI worker failed to start');
    process.exitCode = 1;
    return;
  }

  if (!environment.AI_ENABLED) {
    logger.info('Sentinel AI worker is disabled; exiting');
    return;
  }

  const abortController = new AbortController();
  let isShuttingDown = false;
  const handleSignal = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'AI worker shutdown requested');
    abortController.abort();
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    await runAiWorker(enabledAiEnvironment(environment), abortController.signal, logger);
  } catch (error: unknown) {
    logger.fatal({ err: error }, 'Sentinel AI worker failed');
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}

if (require.main === module) {
  void main();
}
