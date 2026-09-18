import Redis, { type RedisOptions } from 'ioredis';
import type { Logger } from 'pino';

const MAX_RECONNECT_ATTEMPTS = 5;

export function createRedisConnection(redisUrl: string, logger: Logger): Redis {
  const options: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy(attempt) {
      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        return null;
      }

      return Math.min(attempt * 200, 2_000);
    },
  };
  const connection = new Redis(redisUrl, options);

  connection.on('error', (error: Error) => {
    logger.error({ err: error }, 'Redis connection error');
  });

  return connection;
}

export async function connectRedis(connection: Redis, logger: Logger): Promise<void> {
  try {
    await connection.connect();
    await connection.ping();
    logger.info('Redis connection established');
  } catch (error: unknown) {
    logger.error({ err: error }, 'Redis connection failed');
    connection.disconnect(false);
    throw error;
  }
}

export async function disconnectRedis(connection: Redis, logger: Logger): Promise<void> {
  if (connection.status === 'end') {
    return;
  }

  try {
    await connection.quit();
    logger.info('Redis connection closed');
  } catch (error: unknown) {
    logger.error({ err: error }, 'Failed to close Redis connection cleanly');
    connection.disconnect(false);
  }
}
