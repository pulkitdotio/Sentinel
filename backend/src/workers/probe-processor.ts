import type { Logger } from 'pino';

import type {
  CheckResultRecord,
  CheckResultRepository,
  CreateCheckResultRecord,
} from '../modules/checks/check-result-repository';
import type { ProbeMonitorRepository } from '../modules/monitors/monitor-repository';
import type { HttpChecker } from '../monitoring/http-checker';
import { probeJobPayloadSchema, type ProbeJobPayload } from '../queues/jobs/probe';
import type { IncidentEvaluationPublisher } from '../queues/incident-evaluation-publisher';

export class PermanentProbeJobError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentProbeJobError';
  }
}

export type ProbeProcessingOutcome =
  | { status: 'stale' }
  | { status: 'processed' | 'existing'; checkResultId: string };

export class ProbeProcessor {
  public constructor(
    private readonly region: string,
    private readonly monitorRepository: ProbeMonitorRepository,
    private readonly checkResultRepository: CheckResultRepository,
    private readonly httpChecker: HttpChecker,
    private readonly incidentEvaluationPublisher: IncidentEvaluationPublisher,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async process(input: unknown): Promise<ProbeProcessingOutcome> {
    const parsedPayload = probeJobPayloadSchema.safeParse(input);

    if (!parsedPayload.success) {
      throw new PermanentProbeJobError('Probe job payload is invalid');
    }

    const payload = parsedPayload.data;

    if (payload.region !== this.region) {
      throw new PermanentProbeJobError('Probe job region does not match worker region');
    }

    const monitor = await this.monitorRepository.findOwnedById(
      payload.userId,
      payload.monitorId,
    );

    if (!monitor || monitor.isPaused || !monitor.regions.includes(payload.region)) {
      this.logger.debug(
        {
          monitorId: payload.monitorId,
          userId: payload.userId,
          region: payload.region,
          scheduledAt: payload.scheduledAt,
        },
        'Skipping stale probe job',
      );
      return { status: 'stale' };
    }

    const identity = {
      monitorId: payload.monitorId,
      region: payload.region,
      scheduledAt: new Date(payload.scheduledAt),
    };
    const existingResult = await this.checkResultRepository.findByIdentity(identity);

    if (existingResult) {
      await this.completePersistedResult(payload, existingResult);
      return { status: 'existing', checkResultId: existingResult.id };
    }

    const startedAt = this.clock();
    const checkOutcome = await this.httpChecker.check({
      url: monitor.url,
      method: monitor.method,
      timeoutMs: monitor.timeoutMs,
      expectedStatusCodes: monitor.expectedStatusCodes,
    });
    const resultInput: CreateCheckResultRecord = {
      userId: payload.userId,
      monitorId: payload.monitorId,
      region: payload.region,
      scheduledAt: identity.scheduledAt,
      startedAt,
      completedAt: this.clock(),
      success: checkOutcome.success,
      statusCode: checkOutcome.statusCode,
      latencyMs: checkOutcome.latencyMs,
      errorType: checkOutcome.errorType,
    };

    if (checkOutcome.errorMetadata) {
      resultInput.errorMetadata = checkOutcome.errorMetadata;
    }

    const persistedResult = await this.checkResultRepository.saveIdempotently(resultInput);
    await this.completePersistedResult(payload, persistedResult);
    return { status: 'processed', checkResultId: persistedResult.id };
  }

  private async completePersistedResult(
    payload: ProbeJobPayload,
    result: CheckResultRecord,
  ): Promise<void> {
    await this.monitorRepository.updateLastCheckedAt(
      payload.userId,
      payload.monitorId,
      result.completedAt,
    );
    const { jobId } = await this.incidentEvaluationPublisher.enqueue({
      checkResultId: result.id,
    });

    this.logger.debug(
      {
        monitorId: payload.monitorId,
        userId: payload.userId,
        region: payload.region,
        scheduledAt: payload.scheduledAt,
        checkResultId: result.id,
        jobId,
      },
      'Probe result persisted and queued for incident evaluation',
    );
  }
}
