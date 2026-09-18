import { Worker, UnrecoverableError, type Job } from 'bullmq';
import type Redis from 'ioredis';
import pino, { type Logger } from 'pino';

import { getEnvironment } from '../config/env';
import { createLogger } from '../config/logger';
import { connectMongo, disconnectMongo } from '../database/mongo';
import { MongooseCheckResultRepository } from '../modules/checks/check-result-repository';
import { MongooseIncidentRepository } from '../modules/incidents/incident-repository';
import { MongooseMonitorRepository } from '../modules/monitors/monitor-repository';
import {
  connectRedis,
  createRedisConnection,
  disconnectRedis,
} from '../queues/connection';
import {
  INCIDENT_EVALUATION_JOB_NAME,
  type IncidentEvaluationJobPayload,
} from '../queues/jobs/incident-evaluation';
import { INCIDENT_EVALUATION_QUEUE_NAME } from '../queues/names';
import { realtimeChannelName } from '../realtime/channel';
import { RedisRealtimeEventPublisher } from '../realtime/publisher';
import {
  IncidentProcessor,
  PermanentIncidentJobError,
  type IncidentProcessingOutcome,
} from './incident-processor';

export const INCIDENT_WORKER_CONCURRENCY = 1;

export interface IncidentWorkerDefinition {
  queueName: typeof INCIDENT_EVALUATION_QUEUE_NAME;
  concurrency: typeof INCIDENT_WORKER_CONCURRENCY;
  prefix: string;
}

export function createIncidentWorkerDefinition(prefix: string): IncidentWorkerDefinition {
  return {
    queueName: INCIDENT_EVALUATION_QUEUE_NAME,
    concurrency: INCIDENT_WORKER_CONCURRENCY,
    prefix,
  };
}

export function createIncidentWorker(
  definition: IncidentWorkerDefinition,
  connection: Redis,
  processor: IncidentProcessor,
  logger: Logger,
): Worker<IncidentEvaluationJobPayload, IncidentProcessingOutcome> {
  const worker = new Worker<IncidentEvaluationJobPayload, IncidentProcessingOutcome>(
    definition.queueName,
    async (job: Job<IncidentEvaluationJobPayload, IncidentProcessingOutcome>) => {
      if (job.name !== INCIDENT_EVALUATION_JOB_NAME) {
        throw new UnrecoverableError('Unsupported job name on incident-evaluation queue');
      }

      try {
        return await processor.process(job.data);
      } catch (error: unknown) {
        if (error instanceof PermanentIncidentJobError) {
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
    logger.debug(
      { jobId: job.id, checkResultId: job.data.checkResultId, outcome },
      'Incident-evaluation job completed',
    );
  });
  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, checkResultId: job?.data.checkResultId },
      'Incident-evaluation job failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ err: error }, 'Incident worker error');
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

async function runIncidentWorker(signal: AbortSignal, logger: Logger): Promise<void> {
  const environment = getEnvironment();
  const redisConnection = createRedisConnection(environment.REDIS_URL, logger);
  let worker: Worker<IncidentEvaluationJobPayload, IncidentProcessingOutcome> | undefined;

  try {
    await connectMongo(environment.MONGODB_URI, logger);
    await connectRedis(redisConnection, logger);

    const realtimeEventPublisher = new RedisRealtimeEventPublisher(
      redisConnection,
      realtimeChannelName(environment.BULLMQ_PREFIX),
    );
    const processor = new IncidentProcessor(
      new MongooseCheckResultRepository(),
      new MongooseMonitorRepository(),
      new MongooseIncidentRepository(),
      logger,
      realtimeEventPublisher,
    );
    const definition = createIncidentWorkerDefinition(environment.BULLMQ_PREFIX);
    worker = createIncidentWorker(definition, redisConnection, processor, logger);
    await worker.waitUntilReady();

    logger.info(
      { queueName: definition.queueName, concurrency: definition.concurrency },
      'Sentinel incident worker started',
    );

    await waitForShutdown(signal);
  } finally {
    if (worker) {
      try {
        await worker.close();
      } catch (error: unknown) {
        logger.error({ err: error }, 'Failed to close incident worker cleanly');
      }
    }

    await disconnectRedis(redisConnection, logger);
    await disconnectMongo(logger);
    logger.info('Sentinel incident worker stopped');
  }
}

async function main(): Promise<void> {
  let logger: Logger;

  try {
    logger = createLogger(getEnvironment());
  } catch (error: unknown) {
    const bootstrapLogger = pino({
      level: 'error',
      base: { service: 'sentinel-backend' },
    });
    bootstrapLogger.fatal({ err: error }, 'Sentinel incident worker failed to start');
    process.exitCode = 1;
    return;
  }

  const abortController = new AbortController();
  let isShuttingDown = false;
  const handleSignal = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Incident worker shutdown requested');
    abortController.abort();
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    await runIncidentWorker(abortController.signal, logger);
  } catch (error: unknown) {
    logger.fatal({ err: error }, 'Sentinel incident worker failed');
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}

if (require.main === module) {
  void main();
}
