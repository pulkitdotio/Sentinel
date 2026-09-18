import { Worker, UnrecoverableError, type Job } from 'bullmq';
import type Redis from 'ioredis';
import pino, { type Logger } from 'pino';

import { getEnvironment } from '../config/env';
import { createLogger } from '../config/logger';
import { connectMongo, disconnectMongo } from '../database/mongo';
import { MongooseCheckResultRepository } from '../modules/checks/check-result-repository';
import { MongooseMonitorRepository } from '../modules/monitors/monitor-repository';
import { SafeHttpChecker } from '../monitoring/http-checker';
import { UndiciHttpTransport } from '../monitoring/http-transport';
import {
  connectRedis,
  createRedisConnection,
  disconnectRedis,
} from '../queues/connection';
import { BullMqIncidentEvaluationPublisher } from '../queues/incident-evaluation-publisher';
import { PROBE_JOB_NAME, type ProbeJobPayload } from '../queues/jobs/probe';
import { probeQueueName } from '../queues/names';
import { realtimeChannelName } from '../realtime/channel';
import { RedisRealtimeEventPublisher } from '../realtime/publisher';
import {
  PermanentProbeJobError,
  ProbeProcessor,
  type ProbeProcessingOutcome,
} from './probe-processor';

export interface ProbeWorkerDefinition {
  queueName: string;
  concurrency: number;
  prefix: string;
}

export function createProbeWorkerDefinition(
  region: string,
  concurrency: number,
  prefix: string,
): ProbeWorkerDefinition {
  return {
    queueName: probeQueueName(region),
    concurrency,
    prefix,
  };
}

export function createProbeWorker(
  definition: ProbeWorkerDefinition,
  connection: Redis,
  processor: ProbeProcessor,
  logger: Logger,
): Worker<ProbeJobPayload, ProbeProcessingOutcome> {
  const worker = new Worker<ProbeJobPayload, ProbeProcessingOutcome>(
    definition.queueName,
    async (job: Job<ProbeJobPayload, ProbeProcessingOutcome>) => {
      if (job.name !== PROBE_JOB_NAME) {
        throw new UnrecoverableError('Unsupported job name on regional probe queue');
      }

      try {
        return await processor.process(job.data);
      } catch (error: unknown) {
        if (error instanceof PermanentProbeJobError) {
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

  worker.on('completed', (job) => {
    logger.debug(
      { jobId: job.id, region: job.data.region, monitorId: job.data.monitorId },
      'Probe job completed',
    );
  });
  worker.on('failed', (job, error) => {
    logger.error(
      {
        err: error,
        jobId: job?.id,
        region: job?.data.region,
        monitorId: job?.data.monitorId,
      },
      'Probe job failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ err: error }, 'Probe worker error');
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

async function runProbeWorker(signal: AbortSignal, logger: Logger): Promise<void> {
  const environment = getEnvironment();
  const redisConnection = createRedisConnection(environment.REDIS_URL, logger);
  let incidentEvaluationPublisher: BullMqIncidentEvaluationPublisher | undefined;
  let worker: Worker<ProbeJobPayload, ProbeProcessingOutcome> | undefined;

  try {
    await connectMongo(environment.MONGODB_URI, logger);
    await connectRedis(redisConnection, logger);

    const monitorRepository = new MongooseMonitorRepository();
    const checkResultRepository = new MongooseCheckResultRepository();
    incidentEvaluationPublisher = new BullMqIncidentEvaluationPublisher(
      redisConnection,
      environment.BULLMQ_PREFIX,
    );
    const realtimeEventPublisher = new RedisRealtimeEventPublisher(
      redisConnection,
      realtimeChannelName(environment.BULLMQ_PREFIX),
    );
    const httpChecker = new SafeHttpChecker({
      globalTimeoutMs: environment.GLOBAL_CHECK_TIMEOUT_MS,
      maxResponseBodyBytes: environment.MAX_RESPONSE_BODY_BYTES,
      allowPrivateNetworkTargets: environment.ALLOW_PRIVATE_NETWORK_TARGETS,
      transport: new UndiciHttpTransport(),
    });
    const processor = new ProbeProcessor(
      environment.PROBE_REGION,
      monitorRepository,
      checkResultRepository,
      httpChecker,
      incidentEvaluationPublisher,
      logger,
      realtimeEventPublisher,
    );
    const definition = createProbeWorkerDefinition(
      environment.PROBE_REGION,
      environment.PROBE_CONCURRENCY,
      environment.BULLMQ_PREFIX,
    );
    worker = createProbeWorker(
      definition,
      redisConnection,
      processor,
      logger,
    );
    await worker.waitUntilReady();

    logger.info(
      {
        region: environment.PROBE_REGION,
        queueName: definition.queueName,
        concurrency: definition.concurrency,
      },
      'Sentinel regional probe worker started',
    );

    await waitForShutdown(signal);
  } finally {
    if (worker) {
      try {
        await worker.close();
      } catch (error: unknown) {
        logger.error({ err: error }, 'Failed to close probe worker cleanly');
      }
    }

    if (incidentEvaluationPublisher) {
      try {
        await incidentEvaluationPublisher.close();
      } catch (error: unknown) {
        logger.error(
          { err: error },
          'Failed to close incident-evaluation queue cleanly',
        );
      }
    }

    await disconnectRedis(redisConnection, logger);
    await disconnectMongo(logger);
    logger.info('Sentinel regional probe worker stopped');
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
    bootstrapLogger.fatal({ err: error }, 'Sentinel probe worker failed to start');
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
    logger.info({ signal }, 'Probe worker shutdown requested');
    abortController.abort();
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    await runProbeWorker(abortController.signal, logger);
  } catch (error: unknown) {
    logger.fatal({ err: error }, 'Sentinel probe worker failed');
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}

if (require.main === module) {
  void main();
}
