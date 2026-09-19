import Redis from 'ioredis';
import mongoose from 'mongoose';

import { AiAnalysisModel } from '../../src/database/models/ai-analysis';
import { CheckResultModel } from '../../src/database/models/check-result';
import { IncidentModel } from '../../src/database/models/incident';
import { MonitorModel } from '../../src/database/models/monitor';
import { UserModel } from '../../src/database/models/user';

const TEST_DATABASE_NAME = /(test|integration)/i;

function requiredEnvironmentValue(name: 'MONGODB_URI' | 'REDIS_URL' | 'BULLMQ_PREFIX'): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required for real-infrastructure integration tests; no .env file is created automatically`,
    );
  }

  return value;
}

export interface IntegrationInfrastructure {
  redis: Redis;
  redisUrl: string;
  prefix: string;
}

export function integrationMongoConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function startIntegrationMongo(): Promise<void> {
  const mongoUri = requiredEnvironmentValue('MONGODB_URI');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5_000 });
  const databaseName = mongoose.connection.db?.databaseName;

  if (!databaseName || !TEST_DATABASE_NAME.test(databaseName)) {
    await mongoose.disconnect();
    throw new Error(
      `Refusing integration cleanup for MongoDB database "${databaseName ?? 'unknown'}"; the database name must contain "test" or "integration"`,
    );
  }

  await Promise.all([
    UserModel.syncIndexes(),
    MonitorModel.syncIndexes(),
    CheckResultModel.syncIndexes(),
    IncidentModel.syncIndexes(),
    AiAnalysisModel.syncIndexes(),
  ]);
}

export async function startIntegrationRedis(): Promise<IntegrationInfrastructure> {
  const redisUrl = requiredEnvironmentValue('REDIS_URL');
  const basePrefix = requiredEnvironmentValue('BULLMQ_PREFIX');

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);

  try {
    await redis.connect();
    await redis.ping();
  } catch (error: unknown) {
    redis.disconnect(false);
    throw error;
  }

  return {
    redis,
    redisUrl,
    prefix: `${basePrefix}-integration-${String(process.pid)}-${String(Date.now())}`,
  };
}

export async function clearIntegrationMongoData(): Promise<void> {
  await Promise.all([
    AiAnalysisModel.deleteMany({}).exec(),
    CheckResultModel.deleteMany({}).exec(),
    IncidentModel.deleteMany({}).exec(),
    MonitorModel.deleteMany({}).exec(),
    UserModel.deleteMany({}).exec(),
  ]);
}

export async function clearOwnedRedisKeys(redis: Redis, prefix: string): Promise<void> {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${prefix}:*`,
      'COUNT',
      200,
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

export async function stopIntegrationInfrastructure(
  infrastructure: IntegrationInfrastructure | undefined,
): Promise<void> {
  if (infrastructure) {
    await clearOwnedRedisKeys(infrastructure.redis, infrastructure.prefix);
    await infrastructure.redis.quit();
  }

  await mongoose.disconnect();
}

export async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();

    if (predicate(value)) {
      return value;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  const lastValue = await read();
  throw new Error(`Timed out waiting for integration condition: ${JSON.stringify(lastValue)}`);
}
