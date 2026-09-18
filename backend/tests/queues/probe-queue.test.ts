import Redis from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';

const queueState = vi.hoisted(() => ({
  instances: [] as Array<{
    name: string;
    options: unknown;
    additions: Array<{ name: string; data: unknown; options: unknown }>;
    closed: boolean;
  }>,
}));

vi.mock('bullmq', () => ({
  Queue: class FakeQueue {
    private readonly state: (typeof queueState.instances)[number];

    public constructor(name: string, options: unknown) {
      this.state = { name, options, additions: [], closed: false };
      queueState.instances.push(this.state);
    }

    public add(name: string, data: unknown, options: unknown): Promise<void> {
      this.state.additions.push({ name, data, options });
      return Promise.resolve();
    }

    public close(): Promise<void> {
      this.state.closed = true;
      return Promise.resolve();
    }
  },
}));

import {
  createIncidentEvaluationJobId,
  incidentEvaluationJobPayloadSchema,
} from '../../src/queues/jobs/incident-evaluation';
import { BullMqIncidentEvaluationPublisher } from '../../src/queues/incident-evaluation-publisher';
import {
  createProbeJobId,
  probeJobPayloadSchema,
  type ProbeJobPayload,
} from '../../src/queues/jobs/probe';
import { probeQueueName } from '../../src/queues/names';
import {
  BullMqProbeJobPublisher,
  PROBE_JOB_ATTEMPTS,
  PROBE_JOB_BACKOFF_MS,
} from '../../src/queues/probe-job-publisher';
import {
  AI_ANALYSIS_JOB_ATTEMPTS,
  AI_ANALYSIS_JOB_BACKOFF_MS,
  BullMqAiAnalysisJobPublisher,
} from '../../src/queues/ai-analysis-publisher';
import {
  aiAnalysisJobPayloadSchema,
  createAiAnalysisJobId,
} from '../../src/queues/jobs/ai-analysis';

const basePayload: ProbeJobPayload = {
  monitorId: '000000000000000000000001',
  userId: '000000000000000000000002',
  region: 'mumbai',
  scheduledAt: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  queueState.instances.length = 0;
});

describe('probe queue definitions', () => {
  it('derives regional queue names without hard-coding configured regions', () => {
    expect(probeQueueName('mumbai')).toBe('probe-mumbai');
    expect(probeQueueName('us-east-1')).toBe('probe-us-east-1');
    expect(() => probeQueueName('invalid:region')).toThrow();
  });

  it('creates a stable BullMQ-safe deterministic job ID', () => {
    const firstId = createProbeJobId(basePayload);
    const repeatedId = createProbeJobId({ ...basePayload });

    expect(firstId).toBe(
      'probe-000000000000000000000001-mumbai-1767225600000',
    );
    expect(repeatedId).toBe(firstId);
    expect(firstId).not.toContain(':');
  });

  it('changes deterministic IDs for different regions and scheduled timestamps', () => {
    const baseId = createProbeJobId(basePayload);
    const regionalId = createProbeJobId({ ...basePayload, region: 'singapore' });
    const laterId = createProbeJobId({
      ...basePayload,
      scheduledAt: '2026-01-01T00:01:00.000Z',
    });

    expect(regionalId).not.toBe(baseId);
    expect(laterId).not.toBe(baseId);
  });

  it('validates the exact small probe payload shape and canonical UTC timestamp', () => {
    expect(probeJobPayloadSchema.parse(basePayload)).toEqual(basePayload);
    expect(() => probeJobPayloadSchema.parse({ ...basePayload, url: 'https://example.com' })).toThrow();
    expect(() =>
      probeJobPayloadSchema.parse({
        ...basePayload,
        scheduledAt: '2026-01-01T05:30:00+05:30',
      }),
    ).toThrow();
  });

  it('publishes to the correct configured regional queue with the deterministic ID', async () => {
    const connection = new Redis('redis://localhost:6379', { lazyConnect: true });
    const publisher = new BullMqProbeJobPublisher(
      ['mumbai', 'singapore', 'frankfurt'],
      connection,
      'sentinel',
    );

    await publisher.enqueue({ ...basePayload, region: 'singapore' });
    await publisher.close();
    connection.disconnect(false);

    expect(queueState.instances.map((queue) => queue.name)).toEqual([
      'probe-mumbai',
      'probe-singapore',
      'probe-frankfurt',
    ]);
    expect(queueState.instances[1]?.additions).toEqual([
      {
        name: 'probe',
        data: { ...basePayload, region: 'singapore' },
        options: {
          jobId: 'probe-000000000000000000000001-singapore-1767225600000',
          attempts: PROBE_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: PROBE_JOB_BACKOFF_MS },
        },
      },
    ]);
    expect(queueState.instances.every((queue) => queue.closed)).toBe(true);
  });

  it('publishes a minimal deterministic incident-evaluation job', async () => {
    const connection = new Redis('redis://localhost:6379', { lazyConnect: true });
    const publisher = new BullMqIncidentEvaluationPublisher(connection, 'sentinel');
    const payload = { checkResultId: '000000000000000000000003' };

    expect(incidentEvaluationJobPayloadSchema.parse(payload)).toEqual(payload);
    expect(createIncidentEvaluationJobId(payload)).toBe(
      'incident-eval-000000000000000000000003',
    );
    await publisher.enqueue(payload);
    await publisher.close();
    connection.disconnect(false);

    expect(queueState.instances).toHaveLength(1);
    expect(queueState.instances[0]).toMatchObject({
      name: 'incident-evaluation',
      additions: [
        {
          name: 'evaluate-check-result',
          data: payload,
          options: {
            jobId: 'incident-eval-000000000000000000000003',
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000 },
          },
        },
      ],
      closed: true,
    });
  });

  it('publishes an ID-only AI job with bounded retry settings and a deterministic ID', async () => {
    const connection = new Redis('redis://localhost:6379', { lazyConnect: true });
    const publisher = new BullMqAiAnalysisJobPublisher(connection, 'sentinel');
    const payload = { analysisId: '000000000000000000000009' };

    expect(aiAnalysisJobPayloadSchema.parse(payload)).toEqual(payload);
    expect(() => aiAnalysisJobPayloadSchema.parse({ ...payload, context: {} })).toThrow();
    expect(createAiAnalysisJobId(payload)).toBe(
      'ai-analysis-000000000000000000000009',
    );
    await publisher.enqueue(payload);
    await publisher.close();
    connection.disconnect(false);

    expect(queueState.instances).toEqual([
      expect.objectContaining({
        name: 'ai-analysis',
        additions: [
          {
            name: 'analyze',
            data: payload,
            options: {
              jobId: 'ai-analysis-000000000000000000000009',
              attempts: AI_ANALYSIS_JOB_ATTEMPTS,
              backoff: { type: 'exponential', delay: AI_ANALYSIS_JOB_BACKOFF_MS },
            },
          },
        ],
        closed: true,
      }),
    ]);
  });
});
