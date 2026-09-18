import { createServer, type Server } from 'node:http';

import type Redis from 'ioredis';
import pino, { type Logger } from 'pino';

import { createApp } from './app';
import { getEnvironment } from '../config/env';
import { createLogger } from '../config/logger';
import { connectMongo, disconnectMongo } from '../database/mongo';
import {
  connectRedis,
  createRedisConnection,
  disconnectRedis,
} from '../queues/connection';

interface RunningServer {
  httpServer: Server;
  redisConnection: Redis;
  logger: Logger;
}

async function listen(httpServer: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
}

async function closeHttpServer(httpServer: Server): Promise<void> {
  if (!httpServer.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function startServer(): Promise<RunningServer> {
  const environment = getEnvironment();
  const logger = createLogger(environment);
  const redisConnection = createRedisConnection(environment.REDIS_URL, logger);

  try {
    await connectMongo(environment.MONGODB_URI, logger);
    await connectRedis(redisConnection, logger);

    const app = createApp({
      logger,
      isProduction: environment.NODE_ENV === 'production',
    });
    const httpServer = createServer(app);

    await listen(httpServer, environment.PORT);
    logger.info({ port: environment.PORT }, 'Sentinel API server started');

    return { httpServer, redisConnection, logger };
  } catch (error: unknown) {
    redisConnection.disconnect(false);
    await disconnectMongo(logger);
    throw error;
  }
}

async function shutdown(runningServer: RunningServer, signal: NodeJS.Signals): Promise<void> {
  runningServer.logger.info({ signal }, 'Shutdown requested');

  try {
    await closeHttpServer(runningServer.httpServer);
    await disconnectRedis(runningServer.redisConnection, runningServer.logger);
    await disconnectMongo(runningServer.logger);
    runningServer.logger.info('Sentinel API server stopped');
  } catch (error: unknown) {
    runningServer.logger.error({ err: error }, 'Graceful shutdown failed');
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  let runningServer: RunningServer;

  try {
    runningServer = await startServer();
  } catch (error: unknown) {
    const bootstrapLogger = pino({
      level: 'error',
      base: { service: 'sentinel-backend' },
    });
    bootstrapLogger.fatal({ err: error }, 'Sentinel API server failed to start');
    process.exitCode = 1;
    return;
  }

  let isShuttingDown = false;
  const handleSignal = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    void shutdown(runningServer, signal);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
}

if (require.main === module) {
  void main();
}
