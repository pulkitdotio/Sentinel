import mongoose from 'mongoose';
import type { Logger } from 'pino';

const SERVER_SELECTION_TIMEOUT_MS = 10_000;

export async function connectMongo(uri: string, logger: Logger): Promise<void> {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });
    logger.info('MongoDB connection established');
  } catch (error: unknown) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
}

export async function disconnectMongo(logger: Logger): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  } catch (error: unknown) {
    logger.error({ err: error }, 'Failed to close MongoDB connection');
  }
}
