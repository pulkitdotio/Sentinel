import pino, { type Logger } from 'pino';

import { getEnvironment } from '../config/env';
import { createLogger } from '../config/logger';
import { connectMongo, disconnectMongo } from '../database/mongo';
import { MongooseMonitorRepository } from '../modules/monitors/monitor-repository';
import {
  connectRedis,
  createRedisConnection,
  disconnectRedis,
} from '../queues/connection';
import { BullMqProbeJobPublisher } from '../queues/probe-job-publisher';
import { runSchedulerLoop } from './loop';
import { SchedulerService } from './scheduler.service';

async function runScheduler(signal: AbortSignal, logger: Logger): Promise<void> {
  const environment = getEnvironment();
  const redisConnection = createRedisConnection(environment.REDIS_URL, logger);
  let probeJobPublisher: BullMqProbeJobPublisher | undefined;

  try {
    await connectMongo(environment.MONGODB_URI, logger);
    await connectRedis(redisConnection, logger);

    probeJobPublisher = new BullMqProbeJobPublisher(
      environment.ENABLED_REGIONS,
      redisConnection,
      environment.BULLMQ_PREFIX,
    );
    const monitorRepository = new MongooseMonitorRepository();
    const scheduler = new SchedulerService(monitorRepository, probeJobPublisher, logger);

    logger.info(
      {
        pollIntervalMs: environment.SCHEDULER_POLL_INTERVAL_MS,
        enabledRegions: environment.ENABLED_REGIONS,
      },
      'Sentinel scheduler started',
    );

    await runSchedulerLoop(
      scheduler,
      environment.SCHEDULER_POLL_INTERVAL_MS,
      signal,
      logger,
    );
  } finally {
    if (probeJobPublisher) {
      try {
        await probeJobPublisher.close();
      } catch (error: unknown) {
        logger.error({ err: error }, 'Failed to close probe queues cleanly');
      }
    }

    await disconnectRedis(redisConnection, logger);
    await disconnectMongo(logger);
    logger.info('Sentinel scheduler stopped');
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
    bootstrapLogger.fatal({ err: error }, 'Sentinel scheduler failed to start');
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
    logger.info({ signal }, 'Scheduler shutdown requested');
    abortController.abort();
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    await runScheduler(abortController.signal, logger);
  } catch (error: unknown) {
    logger.fatal({ err: error }, 'Sentinel scheduler failed');
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}

if (require.main === module) {
  void main();
}
