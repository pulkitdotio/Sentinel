import { describe, expect, it } from 'vitest';

import { createProbeWorkerDefinition } from '../../src/workers/probe.worker';

describe('regional probe worker configuration', () => {
  it('consumes only the queue for PROBE_REGION and uses configured concurrency', () => {
    expect(createProbeWorkerDefinition('mumbai', 20, 'sentinel')).toEqual({
      queueName: 'probe-mumbai',
      concurrency: 20,
      prefix: 'sentinel',
    });
    expect(createProbeWorkerDefinition('singapore', 7, 'custom-prefix')).toEqual({
      queueName: 'probe-singapore',
      concurrency: 7,
      prefix: 'custom-prefix',
    });
  });
});
