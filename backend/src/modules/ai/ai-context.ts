import type { MonitorMetricsResponse, MetricsService } from '../metrics/metrics.service';
import type { IncidentRecord, IncidentRepository } from '../incidents/incident-repository';
import type { MonitorRecord } from '../monitors/monitor-repository';
import type { AiAnalysisRecord } from './ai-analysis-repository';
import type {
  AiTelemetryRepository,
  RepresentativeCheck,
} from './ai-telemetry-repository';
import type { AiFailureCode } from './ai-contracts';

export const MAX_AI_RECENT_INCIDENTS = 5;
export const MAX_AI_REPRESENTATIVE_FAILURES = 12;
export const MAX_AI_INCIDENT_EVENTS = 10;
export const MAX_AI_INCIDENT_REPRESENTATIVE_CHECKS = 12;
export const AI_INCIDENT_SAMPLE_WINDOW_MS = 30 * 60 * 1_000;
const MAX_AI_REGIONS = 20;

export interface AiContextMonitorRepository {
  findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null>;
}

export interface MonitorHealthAiInput {
  evidence: {
    monitor: {
      id: string;
      currentStatus: MonitorRecord['status'];
      failureThreshold: number;
      recoveryThreshold: number;
      latencyThresholdMs: number;
      configuredRegions: string[];
    };
    inputWindow: { from: string; to: string };
    totals: MonitorMetricsResponse['totals'];
    uptimePercentage: number | null;
    latency: MonitorMetricsResponse['latency'];
    regions: MonitorMetricsResponse['regions'];
    recentIncidents: MonitorMetricsResponse['recentIncidents'];
    errorTypeCounts: Array<{ value: string; count: number }>;
    successfulChecksAboveLatencyThreshold: number;
    representativeFailures: SafeRepresentativeCheck[];
  };
}

export interface IncidentAiInput {
  evidence: {
    incident: {
      id: string;
      monitorId: string;
      openedAt: string;
      resolvedAt: string;
      durationMs: number;
      triggerReason: string;
      openingStatusEvidence: IncidentRecord['openingStatusEvidence'];
      timeline: Array<{ type: string; at: string; message: string }>;
    };
    monitor: {
      id: string;
      configuredRegions: string[];
      latencyThresholdMs: number;
    };
    regionalMetrics: MonitorMetricsResponse['regions'];
    totals: MonitorMetricsResponse['totals'];
    uptimePercentage: number | null;
    latency: MonitorMetricsResponse['latency'];
    errorTypeCounts: Array<{ value: string; count: number }>;
    statusCodeCounts: Array<{ value: number; count: number }>;
    representativeFailuresNearOpening: SafeRepresentativeCheck[];
    representativeSuccessesNearRecovery: SafeRepresentativeCheck[];
  };
}

export class AiContextError extends Error {
  public constructor(public readonly code: Extract<AiFailureCode, 'AI_CONTEXT_UNAVAILABLE' | 'AI_RESOURCE_NOT_FOUND'>) {
    super(code);
    this.name = 'AiContextError';
  }
}

interface SafeRepresentativeCheck {
  region: string;
  scheduledAt: string;
  statusCode: number | null;
  latencyMs: number | null;
  errorType: string | null;
}

function safeCheck(check: RepresentativeCheck): SafeRepresentativeCheck {
  return {
    region: check.region,
    scheduledAt: check.scheduledAt.toISOString(),
    statusCode: check.statusCode,
    latencyMs: check.latencyMs,
    errorType: check.errorType,
  };
}

function ownedRange(analysis: AiAnalysisRecord): {
  userId: string;
  monitorId: string;
  from: Date;
  to: Date;
} {
  if (!analysis.monitorId) {
    throw new AiContextError('AI_CONTEXT_UNAVAILABLE');
  }

  return {
    userId: analysis.userId,
    monitorId: analysis.monitorId,
    from: analysis.inputWindow.from,
    to: analysis.inputWindow.to,
  };
}

export class AiContextBuilder {
  public constructor(
    private readonly monitorRepository: AiContextMonitorRepository,
    private readonly incidentRepository: Pick<IncidentRepository, 'findOwnedById'>,
    private readonly metricsService: MetricsService,
    private readonly telemetryRepository: AiTelemetryRepository,
  ) {}

  public async buildMonitorHealth(analysis: AiAnalysisRecord): Promise<MonitorHealthAiInput> {
    const range = ownedRange(analysis);
    const monitor = await this.monitorRepository.findOwnedById(analysis.userId, range.monitorId);

    if (!monitor) {
      throw new AiContextError('AI_RESOURCE_NOT_FOUND');
    }

    const [metrics, telemetry, failures] = await Promise.all([
      this.metricsService.getMetrics(analysis.userId, monitor.id, range),
      this.telemetryRepository.summarizeOwnedRange(range, monitor.latencyThresholdMs),
      this.telemetryRepository.listRepresentativeChecks({
        ...range,
        success: false,
        limit: MAX_AI_REPRESENTATIVE_FAILURES,
      }),
    ]);

    return {
      evidence: {
        monitor: {
          id: monitor.id,
          currentStatus: monitor.status,
          failureThreshold: monitor.failureThreshold,
          recoveryThreshold: monitor.recoveryThreshold,
          latencyThresholdMs: monitor.latencyThresholdMs,
          configuredRegions: monitor.regions.slice(0, MAX_AI_REGIONS),
        },
        inputWindow: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        },
        totals: metrics.totals,
        uptimePercentage: metrics.uptimePercentage,
        latency: metrics.latency,
        regions: metrics.regions.slice(0, MAX_AI_REGIONS),
        recentIncidents: metrics.recentIncidents.slice(0, MAX_AI_RECENT_INCIDENTS),
        errorTypeCounts: telemetry.errorTypeCounts,
        successfulChecksAboveLatencyThreshold:
          telemetry.successfulChecksAboveLatencyThreshold,
        representativeFailures: failures
          .slice(0, MAX_AI_REPRESENTATIVE_FAILURES)
          .map(safeCheck),
      },
    };
  }

  public async buildIncidentSummary(analysis: AiAnalysisRecord): Promise<IncidentAiInput> {
    const range = ownedRange(analysis);

    if (!analysis.incidentId) {
      throw new AiContextError('AI_CONTEXT_UNAVAILABLE');
    }

    const [incident, monitor] = await Promise.all([
      this.incidentRepository.findOwnedById(analysis.userId, analysis.incidentId),
      this.monitorRepository.findOwnedById(analysis.userId, range.monitorId),
    ]);

    if (!incident || !monitor) {
      throw new AiContextError('AI_RESOURCE_NOT_FOUND');
    }

    if (incident.status !== 'resolved' || !incident.resolvedAt) {
      throw new AiContextError('AI_CONTEXT_UNAVAILABLE');
    }

    const openingWindow = {
      ...range,
      from: new Date(incident.openedAt.getTime() - AI_INCIDENT_SAMPLE_WINDOW_MS),
      to: new Date(incident.openedAt.getTime() + AI_INCIDENT_SAMPLE_WINDOW_MS),
    };
    const recoveryWindow = {
      ...range,
      from: new Date(incident.resolvedAt.getTime() - AI_INCIDENT_SAMPLE_WINDOW_MS),
      to: new Date(incident.resolvedAt.getTime() + AI_INCIDENT_SAMPLE_WINDOW_MS),
    };
    const representativeLimit = MAX_AI_INCIDENT_REPRESENTATIVE_CHECKS / 2;
    const [metrics, telemetry, failures, successes] = await Promise.all([
      this.metricsService.getMetrics(analysis.userId, monitor.id, range),
      this.telemetryRepository.summarizeOwnedRange(range, monitor.latencyThresholdMs),
      this.telemetryRepository.listRepresentativeChecks({
        ...openingWindow,
        success: false,
        limit: representativeLimit,
      }),
      this.telemetryRepository.listRepresentativeChecks({
        ...recoveryWindow,
        success: true,
        limit: representativeLimit,
      }),
    ]);

    return {
      evidence: {
        incident: {
          id: incident.id,
          monitorId: incident.monitorId,
          openedAt: incident.openedAt.toISOString(),
          resolvedAt: incident.resolvedAt.toISOString(),
          durationMs: Math.max(0, incident.resolvedAt.getTime() - incident.openedAt.getTime()),
          triggerReason: incident.triggerReason,
          openingStatusEvidence: incident.openingStatusEvidence,
          timeline: incident.events.slice(0, MAX_AI_INCIDENT_EVENTS).map((event) => ({
            type: event.type,
            at: event.at.toISOString(),
            message: event.message,
          })),
        },
        monitor: {
          id: monitor.id,
          configuredRegions: monitor.regions.slice(0, MAX_AI_REGIONS),
          latencyThresholdMs: monitor.latencyThresholdMs,
        },
        regionalMetrics: metrics.regions.slice(0, MAX_AI_REGIONS),
        totals: metrics.totals,
        uptimePercentage: metrics.uptimePercentage,
        latency: metrics.latency,
        errorTypeCounts: telemetry.errorTypeCounts,
        statusCodeCounts: telemetry.statusCodeCounts,
        representativeFailuresNearOpening: failures
          .slice(0, representativeLimit)
          .map(safeCheck),
        representativeSuccessesNearRecovery: successes
          .slice(0, representativeLimit)
          .map(safeCheck),
      },
    };
  }
}
