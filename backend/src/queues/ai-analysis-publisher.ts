import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import {
  AI_ANALYSIS_JOB_NAME,
  aiAnalysisJobPayloadSchema,
  createAiAnalysisJobId,
  type AiAnalysisJobPayload,
} from './jobs/ai-analysis';
import { AI_ANALYSIS_QUEUE_NAME } from './names';

export const AI_ANALYSIS_JOB_ATTEMPTS = 2;
export const AI_ANALYSIS_JOB_BACKOFF_MS = 2_000;

export interface AiAnalysisJobPublisher {
  enqueue(payload: AiAnalysisJobPayload): Promise<{ jobId: string }>;
}

export const UNAVAILABLE_AI_ANALYSIS_JOB_PUBLISHER: AiAnalysisJobPublisher = {
  enqueue: () => Promise.reject(new Error('AI analysis queue is unavailable')),
};

export class BullMqAiAnalysisJobPublisher implements AiAnalysisJobPublisher {
  private readonly queue: Queue<AiAnalysisJobPayload, void, typeof AI_ANALYSIS_JOB_NAME>;

  public constructor(connection: Redis, prefix: string) {
    this.queue = new Queue(AI_ANALYSIS_QUEUE_NAME, { connection, prefix });
  }

  public async enqueue(input: AiAnalysisJobPayload): Promise<{ jobId: string }> {
    const payload = aiAnalysisJobPayloadSchema.parse(input);
    const jobId = createAiAnalysisJobId(payload);
    await this.queue.add(AI_ANALYSIS_JOB_NAME, payload, {
      jobId,
      attempts: AI_ANALYSIS_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: AI_ANALYSIS_JOB_BACKOFF_MS },
    });
    return { jobId };
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
