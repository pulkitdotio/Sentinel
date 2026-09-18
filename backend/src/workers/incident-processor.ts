import type { Logger } from 'pino';

import { MAX_INCIDENT_EVIDENCE_REGIONS } from '../database/models/incident';
import type { IncidentCheckResultRepository } from '../modules/checks/check-result-repository';
import { deriveMonitorHealth } from '../modules/incidents/health-engine';
import type { IncidentRepository } from '../modules/incidents/incident-repository';
import type {
  IncidentMonitorRepository,
  MonitorEvaluationSnapshot,
  MonitorRecord,
} from '../modules/monitors/monitor-repository';
import { incidentEvaluationJobPayloadSchema } from '../queues/jobs/incident-evaluation';
import {
  incidentOpenedEventId,
  incidentResolvedEventId,
  monitorStatusChangedEventId,
  type RealtimeDomainEvent,
} from '../realtime/events';
import {
  NOOP_REALTIME_EVENT_PUBLISHER,
  type RealtimeEventPublisher,
} from '../realtime/publisher';

const MAX_OPTIMISTIC_EVALUATION_ATTEMPTS = 3;

export class PermanentIncidentJobError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentIncidentJobError';
  }
}

export type IncidentProcessingOutcome =
  | { status: 'stale' }
  | { status: 'unchanged'; monitorStatus: MonitorRecord['status'] }
  | { status: 'updated'; monitorStatus: MonitorRecord['status'] };

function evaluationSnapshot(monitor: MonitorRecord): MonitorEvaluationSnapshot {
  return {
    status: monitor.status,
    regions: [...monitor.regions],
    failureThreshold: monitor.failureThreshold,
    recoveryThreshold: monitor.recoveryThreshold,
    latencyThresholdMs: monitor.latencyThresholdMs,
  };
}

export class IncidentProcessor {
  public constructor(
    private readonly checkResultRepository: IncidentCheckResultRepository,
    private readonly monitorRepository: IncidentMonitorRepository,
    private readonly incidentRepository: IncidentRepository,
    private readonly logger: Logger,
    private readonly realtimeEventPublisher: RealtimeEventPublisher =
      NOOP_REALTIME_EVENT_PUBLISHER,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async process(input: unknown): Promise<IncidentProcessingOutcome> {
    const parsedPayload = incidentEvaluationJobPayloadSchema.safeParse(input);

    if (!parsedPayload.success) {
      throw new PermanentIncidentJobError('Incident-evaluation job payload is invalid');
    }

    const triggeringResult = await this.checkResultRepository.findById(
      parsedPayload.data.checkResultId,
    );

    if (!triggeringResult) {
      this.logger.debug(
        { checkResultId: parsedPayload.data.checkResultId },
        'Skipping stale incident-evaluation job with missing check result',
      );
      return { status: 'stale' };
    }

    for (let attempt = 1; attempt <= MAX_OPTIMISTIC_EVALUATION_ATTEMPTS; attempt += 1) {
      const monitor = await this.monitorRepository.findOwnedById(
        triggeringResult.userId,
        triggeringResult.monitorId,
      );

      if (
        !monitor ||
        monitor.isPaused ||
        !monitor.regions.includes(triggeringResult.region)
      ) {
        this.logger.debug(
          {
            checkResultId: triggeringResult.id,
            monitorId: triggeringResult.monitorId,
            region: triggeringResult.region,
          },
          'Skipping stale incident-evaluation job',
        );
        return { status: 'stale' };
      }

      const historyLimit = Math.max(
        monitor.failureThreshold,
        monitor.recoveryThreshold,
      );
      const historyEntries = await Promise.all(
        monitor.regions.map(async (region) => [
          region,
          await this.checkResultRepository.listRecentByRegion(
            monitor.id,
            region,
            historyLimit,
          ),
        ] as const),
      );
      const histories = new Map(historyEntries);
      const openIncident = await this.incidentRepository.findOpenByMonitor(monitor.id);
      const evaluation = deriveMonitorHealth({
        regions: monitor.regions,
        histories,
        failureThreshold: monitor.failureThreshold,
        recoveryThreshold: monitor.recoveryThreshold,
        latencyThresholdMs: monitor.latencyThresholdMs,
        isPaused: monitor.isPaused,
        hasOpenIncident: openIncident !== null,
      });
      const transitionAt = this.clock();
      let outcome: IncidentProcessingOutcome = {
        status: 'unchanged',
        monitorStatus: monitor.status,
      };

      if (evaluation.status !== monitor.status) {
        const wasUpdated = await this.monitorRepository.updateEvaluationStatus(
          monitor.userId,
          monitor.id,
          evaluationSnapshot(monitor),
          evaluation.status,
        );

        if (!wasUpdated) {
          this.logger.debug(
            { monitorId: monitor.id, attempt },
            'Retrying incident evaluation after concurrent monitor change',
          );
          continue;
        }

        outcome = { status: 'updated', monitorStatus: evaluation.status };

        await this.publishRealtimeBestEffort({
          version: 1,
          eventId: monitorStatusChangedEventId(
            monitor.id,
            monitor.status,
            evaluation.status,
            transitionAt,
          ),
          userId: monitor.userId,
          type: 'monitor.status_changed',
          occurredAt: transitionAt.toISOString(),
          payload: {
            monitorId: monitor.id,
            previousStatus: monitor.status,
            status: evaluation.status,
            changedAt: transitionAt.toISOString(),
          },
        });
      }

      if (evaluation.shouldOpenIncident) {
        const opened = await this.incidentRepository.openIdempotently({
          userId: monitor.userId,
          monitorId: monitor.id,
          openedAt: transitionAt,
          triggerReason: 'regional_failure_consensus',
          openingStatusEvidence: {
            requiredConsensus: evaluation.requiredConsensus,
            failureThreshold: monitor.failureThreshold,
            regions: evaluation.evidence
              .filter((region) => region.failureThresholdMet)
              .slice(0, MAX_INCIDENT_EVIDENCE_REGIONS)
              .map((region) => ({
                region: region.region,
                consecutiveFailures: region.consecutiveFailures,
                latestErrorType: region.latestErrorType,
            })),
          },
        });

        if (opened.created) {
          await this.publishRealtimeBestEffort({
            version: 1,
            eventId: incidentOpenedEventId(opened.incident.id),
            userId: opened.incident.userId,
            type: 'incident.opened',
            occurredAt: opened.incident.openedAt.toISOString(),
            payload: {
              incidentId: opened.incident.id,
              monitorId: opened.incident.monitorId,
              status: 'open',
              openedAt: opened.incident.openedAt.toISOString(),
              triggerReason: opened.incident.triggerReason,
            },
          });
        }
      }

      if (evaluation.shouldResolveIncident && openIncident) {
        const resolved = await this.incidentRepository.resolveIfOpen(
          openIncident.id,
          transitionAt,
        );

        if (resolved?.resolvedAt) {
          const durationMs = resolved.resolvedAt.getTime() - resolved.openedAt.getTime();

          await this.publishRealtimeBestEffort({
            version: 1,
            eventId: incidentResolvedEventId(resolved.id),
            userId: resolved.userId,
            type: 'incident.resolved',
            occurredAt: resolved.resolvedAt.toISOString(),
            payload: {
              incidentId: resolved.id,
              monitorId: resolved.monitorId,
              status: 'resolved',
              openedAt: resolved.openedAt.toISOString(),
              resolvedAt: resolved.resolvedAt.toISOString(),
              durationMs: durationMs >= 0 ? durationMs : null,
              triggerReason: resolved.triggerReason,
            },
          });
        }
      }

      return outcome;
    }

    throw new Error('Incident evaluation could not converge after concurrent updates');
  }

  private async publishRealtimeBestEffort(event: RealtimeDomainEvent): Promise<void> {
    try {
      await this.realtimeEventPublisher.publish(event);
    } catch (error: unknown) {
      this.logger.error(
        {
          err: error,
          eventId: event.eventId,
          eventType: event.type,
          resourceId:
            'monitorId' in event.payload
              ? event.payload.monitorId
              : event.payload.resourceId,
        },
        'Realtime event publishing failed after incident state became durable',
      );
    }
  }
}
