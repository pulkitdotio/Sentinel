import { createServer, type Server } from 'node:http';

import type Redis from 'ioredis';
import pino, { type Logger } from 'pino';

import { createApp } from './app';
import { RealtimeRedisBridge } from './socket/realtime-bridge';
import {
  attachSocketServer,
  type RealtimeSocketServer,
} from './socket/socket-server';
import { getEnvironment } from '../config/env';
import { createLogger } from '../config/logger';
import { connectMongo, disconnectMongo } from '../database/mongo';
import {
  connectRedis,
  createRedisConnection,
  disconnectRedis,
} from '../queues/connection';
import { BullMqAiAnalysisJobPublisher } from '../queues/ai-analysis-publisher';
import { realtimeChannelName } from '../realtime/channel';

export interface RunningServer {
  httpServer: Server;
  socketServer: RealtimeSocketServer;
  redisConnection: Redis;
  redisSubscriber: Redis;
  realtimeBridge: RealtimeRedisBridge;
  aiAnalysisJobPublisher: BullMqAiAnalysisJobPublisher | null;
  logger: Logger;
}

export interface ApiRedisConnections {
  redisConnection: Redis;
  redisSubscriber: Redis;
}

export function createApiRedisConnections(
  redisUrl: string,
  logger: Logger,
): ApiRedisConnections {
  return {
    redisConnection: createRedisConnection(redisUrl, logger),
    redisSubscriber: createRedisConnection(redisUrl, logger),
  };
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

async function closeSocketServer(socketServer: RealtimeSocketServer): Promise<void> {
  await socketServer.close();
}

export async function startServer(): Promise<RunningServer> {
  const environment = getEnvironment();
  const logger = createLogger(environment);
  const { redisConnection, redisSubscriber } = createApiRedisConnections(
    environment.REDIS_URL,
    logger,
  );
  let httpServer: Server | undefined;
  let socketServer: RealtimeSocketServer | undefined;
  let realtimeBridge: RealtimeRedisBridge | undefined;
  let aiAnalysisJobPublisher: BullMqAiAnalysisJobPublisher | undefined;

  try {
    await connectMongo(environment.MONGODB_URI, logger);
    await connectRedis(redisConnection, logger);
    await connectRedis(redisSubscriber, logger);

    if (environment.AI_ENABLED) {
      aiAnalysisJobPublisher = new BullMqAiAnalysisJobPublisher(
        redisConnection,
        environment.BULLMQ_PREFIX,
      );
    }

    const app = createApp({
      logger,
      isProduction: environment.NODE_ENV === 'production',
      clientOrigin: environment.CLIENT_ORIGIN,
      auth: {
        secret: environment.JWT_SECRET,
        expiresIn: environment.JWT_EXPIRES_IN,
      },
      monitors: {
        enabledRegions: environment.ENABLED_REGIONS,
      },
      ai: {
        enabled: environment.AI_ENABLED,
        ...(aiAnalysisJobPublisher === undefined
          ? {}
          : { queuePublisher: aiAnalysisJobPublisher }),
      },
    });
    httpServer = createServer(app);
    socketServer = attachSocketServer(httpServer, environment.CLIENT_ORIGIN, {
      secret: environment.JWT_SECRET,
      expiresIn: environment.JWT_EXPIRES_IN,
    });
    realtimeBridge = new RealtimeRedisBridge(
      redisSubscriber,
      realtimeChannelName(environment.BULLMQ_PREFIX),
      socketServer,
      logger,
    );
    await realtimeBridge.start();

    await listen(httpServer, environment.PORT);
    logger.info({ port: environment.PORT }, 'Sentinel API server started');

    return {
      httpServer,
      socketServer,
      redisConnection,
      redisSubscriber,
      realtimeBridge,
      aiAnalysisJobPublisher: aiAnalysisJobPublisher ?? null,
      logger,
    };
  } catch (error: unknown) {
    if (socketServer) {
      await closeSocketServer(socketServer);
    }

    if (realtimeBridge) {
      try {
        await realtimeBridge.stop();
      } catch (stopError: unknown) {
        logger.error({ err: stopError }, 'Failed to stop realtime bridge after startup error');
      }
    }

    if (aiAnalysisJobPublisher) {
      try {
        await aiAnalysisJobPublisher.close();
      } catch (closeError: unknown) {
        logger.error({ err: closeError }, 'Failed to close AI analysis queue after startup error');
      }
    }

    redisSubscriber.disconnect(false);
    redisConnection.disconnect(false);

    if (httpServer) {
      await closeHttpServer(httpServer);
    }

    await disconnectMongo(logger);
    throw error;
  }
}

export async function stopServer(
  runningServer: RunningServer,
  signal?: NodeJS.Signals,
): Promise<void> {
  runningServer.logger.info({ signal }, 'Shutdown requested');
  let failed = false;

  try {
    await closeSocketServer(runningServer.socketServer);
  } catch (error: unknown) {
    failed = true;
    runningServer.logger.error({ err: error }, 'Failed to close Socket.IO server');
  }

  try {
    await runningServer.realtimeBridge.stop();
  } catch (error: unknown) {
    failed = true;
    runningServer.logger.error({ err: error }, 'Failed to stop realtime Redis bridge');
  }

  if (runningServer.aiAnalysisJobPublisher) {
    try {
      await runningServer.aiAnalysisJobPublisher.close();
    } catch (error: unknown) {
      failed = true;
      runningServer.logger.error({ err: error }, 'Failed to close AI analysis queue');
    }
  }

  await disconnectRedis(runningServer.redisSubscriber, runningServer.logger);
  await disconnectRedis(runningServer.redisConnection, runningServer.logger);

  try {
    await closeHttpServer(runningServer.httpServer);
  } catch (error: unknown) {
    failed = true;
    runningServer.logger.error({ err: error }, 'Failed to close HTTP server');
  }

  await disconnectMongo(runningServer.logger);
  runningServer.logger.info('Sentinel API server stopped');

  if (failed) {
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
  let resolveShutdown: ((signal: NodeJS.Signals) => void) | undefined;
  const shutdownRequested = new Promise<NodeJS.Signals>((resolve) => {
    resolveShutdown = resolve;
  });
  const handleSignal = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    resolveShutdown?.(signal);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    await stopServer(runningServer, await shutdownRequested);
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }
}

if (require.main === module) {
  void main();
}
