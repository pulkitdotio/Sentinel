import { describe, expect, it } from 'vitest';

import {
  AI_WORKER_CONCURRENCY,
  createAiWorkerDefinition,
} from '../../src/workers/ai.worker';

describe('AI worker configuration', () => {
  it('is a dedicated ai-analysis runtime with fixed bounded concurrency', () => {
    expect(AI_WORKER_CONCURRENCY).toBe(2);
    expect(createAiWorkerDefinition('sentinel')).toEqual({
      queueName: 'ai-analysis',
      concurrency: 2,
      prefix: 'sentinel',
    });
  });
});
