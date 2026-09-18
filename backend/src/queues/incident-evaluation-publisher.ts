import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import {
  createIncidentEvaluationJobId,
  INCIDENT_EVALUATION_JOB_NAME,
  incidentEvaluationJobPayloadSchema,
  type IncidentEvaluationJobPayload,
} from './jobs/incident-evaluation';
import { INCIDENT_EVALUATION_QUEUE_NAME } from './names';

export interface IncidentEvaluationPublisher {
  enqueue(payload: IncidentEvaluationJobPayload): Promise<{ jobId: string }>;
}

const INCIDENT_EVALUATION_ATTEMPTS = 3;
const INCIDENT_EVALUATION_BACKOFF_MS = 1_000;

export class BullMqIncidentEvaluationPublisher
  implements IncidentEvaluationPublisher
{
  private readonly queue: Queue<
    IncidentEvaluationJobPayload,
    void,
    typeof INCIDENT_EVALUATION_JOB_NAME
  >;

  public constructor(connection: Redis, prefix: string) {
    this.queue = new Queue(INCIDENT_EVALUATION_QUEUE_NAME, {
      connection,
      prefix,
    });
  }

  public async enqueue(
    input: IncidentEvaluationJobPayload,
  ): Promise<{ jobId: string }> {
    const payload = incidentEvaluationJobPayloadSchema.parse(input);
    const jobId = createIncidentEvaluationJobId(payload);
    await this.queue.add(INCIDENT_EVALUATION_JOB_NAME, payload, {
      jobId,
      attempts: INCIDENT_EVALUATION_ATTEMPTS,
      backoff: { type: 'exponential', delay: INCIDENT_EVALUATION_BACKOFF_MS },
    });
    return { jobId };
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
