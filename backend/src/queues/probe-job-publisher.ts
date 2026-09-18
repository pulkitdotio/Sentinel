import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import {
  createProbeJobId,
  PROBE_JOB_NAME,
  probeJobPayloadSchema,
  type ProbeJobPayload,
} from './jobs/probe';
import { probeQueueName, regionIdentifierSchema } from './names';

export interface PublishedProbeJob {
  jobId: string;
}

export interface ProbeJobPublisher {
  enqueue(payload: ProbeJobPayload): Promise<PublishedProbeJob>;
}

export const PROBE_JOB_ATTEMPTS = 3;
export const PROBE_JOB_BACKOFF_MS = 1_000;

export class BullMqProbeJobPublisher implements ProbeJobPublisher {
  private readonly queues = new Map<string, Queue<ProbeJobPayload, void, typeof PROBE_JOB_NAME>>();

  public constructor(
    enabledRegions: readonly string[],
    connection: Redis,
    prefix: string,
  ) {
    for (const configuredRegion of enabledRegions) {
      const region = regionIdentifierSchema.parse(configuredRegion);

      if (this.queues.has(region)) {
        throw new Error(`Duplicate probe queue region: ${region}`);
      }

      this.queues.set(
        region,
        new Queue<ProbeJobPayload, void, typeof PROBE_JOB_NAME>(probeQueueName(region), {
          connection,
          prefix,
        }),
      );
    }
  }

  public async enqueue(input: ProbeJobPayload): Promise<PublishedProbeJob> {
    const payload = probeJobPayloadSchema.parse(input);
    const queue = this.queues.get(payload.region);

    if (!queue) {
      throw new Error(`No probe queue is configured for region: ${payload.region}`);
    }

    const jobId = createProbeJobId(payload);
    await queue.add(PROBE_JOB_NAME, payload, {
      jobId,
      attempts: PROBE_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: PROBE_JOB_BACKOFF_MS },
    });
    return { jobId };
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map(async (queue) => queue.close()));
  }
}
