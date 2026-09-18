import { describe, expect, it } from 'vitest';

import {
  createIncidentWorkerDefinition,
  INCIDENT_WORKER_CONCURRENCY,
} from '../../src/workers/incident.worker';

describe('incident worker configuration', () => {
  it('consumes the existing incident queue with explicit single-job concurrency', () => {
    expect(INCIDENT_WORKER_CONCURRENCY).toBe(1);
    expect(createIncidentWorkerDefinition('sentinel')).toEqual({
      queueName: 'incident-evaluation',
      concurrency: 1,
      prefix: 'sentinel',
    });
  });
});
