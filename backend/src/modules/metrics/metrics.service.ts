import { AppError } from '../../shared/errors/app-error';
import type {
  CheckHistoryRecord,
  LatestRegionalCheck,
  MetricsCheckResultRepository,
  OwnedCheckRange,
  RegionalCheckAggregate,
} from '../checks/check-result-repository';
import type { IncidentPage, IncidentRecord } from '../incidents/incident-repository';
import type { MonitorRecord } from '../monitors/monitor-repository';
import {
  calculateLatencyStatistics,
  calculateUptimePercentage,
  roundToTwoDecimalPlaces,
} from './metrics-math';
import type { EffectiveTimeRange } from './time-range';

const RECENT_INCIDENT_LIMIT = 5;

export interface MetricsMonitorRepository {
  findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null>;
}

export interface MetricsIncidentRepository {
  listOwnedByMonitor(
    userId: string,
    monitorId: string,
    skip: number,
    limit: number,
  ): Promise<IncidentPage>;
}

export interface CheckHistoryOptions {
  region?: string;
  page: number;
  limit: number;
}

export interface SafeCheckResult {
  id: string;
  monitorId: string;
  region: string;
  scheduledAt: string;
  startedAt: string;
  completedAt: string;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorType: string | null;
  errorMetadata?: { code: string };
}

export interface CheckHistoryResponse {
  checks: SafeCheckResult[];
  range: { from: string; to: string };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LatestCheckSummary {
  scheduledAt: string;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorType: string | null;
}

export interface RegionalMetricsSummary {
  region: string;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  uptimePercentage: number | null;
  averageLatencyMs: number | null;
  latestCheck: LatestCheckSummary | null;
}

export interface MonitorMetricsResponse {
  monitor: {
    id: string;
    name: string;
    status: MonitorRecord['status'];
    isPaused: boolean;
    lastCheckedAt: string | null;
    regions: string[];
  };
  range: { from: string; to: string };
  totals: {
    checks: number;
    successfulChecks: number;
    failedChecks: number;
  };
  uptimePercentage: number | null;
  latency: {
    sampleCount: number;
    averageMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
  };
  regions: RegionalMetricsSummary[];
  recentIncidents: Array<{
    id: string;
    status: IncidentRecord['status'];
    openedAt: string;
    resolvedAt: string | null;
    triggerReason: string;
  }>;
}

function monitorNotFoundError(): AppError {
  return new AppError(404, 'MONITOR_NOT_FOUND', 'Monitor not found');
}

function responseRange(range: EffectiveTimeRange): { from: string; to: string } {
  return { from: range.from.toISOString(), to: range.to.toISOString() };
}

function toSafeCheckResult(check: CheckHistoryRecord): SafeCheckResult {
  const result: SafeCheckResult = {
    id: check.id,
    monitorId: check.monitorId,
    region: check.region,
    scheduledAt: check.scheduledAt.toISOString(),
    startedAt: check.startedAt.toISOString(),
    completedAt: check.completedAt.toISOString(),
    success: check.success,
    statusCode: check.statusCode,
    latencyMs: check.latencyMs,
    errorType: check.errorType,
  };

  if (check.errorMetadata?.code) {
    result.errorMetadata = { code: check.errorMetadata.code };
  }

  return result;
}

function toLatestCheckSummary(check: LatestRegionalCheck): LatestCheckSummary {
  return {
    scheduledAt: check.scheduledAt.toISOString(),
    success: check.success,
    statusCode: check.statusCode,
    latencyMs: check.latencyMs,
    errorType: check.errorType,
  };
}

function regionalSummary(
  region: string,
  aggregate: RegionalCheckAggregate | undefined,
  latestCheck: LatestRegionalCheck | undefined,
): RegionalMetricsSummary {
  const totalChecks = aggregate?.totalChecks ?? 0;
  const successfulChecks = aggregate?.successfulChecks ?? 0;
  const latencySampleCount = aggregate?.latencySampleCount ?? 0;
  const latencyTotalMs = aggregate?.latencyTotalMs ?? 0;

  return {
    region,
    totalChecks,
    successfulChecks,
    failedChecks: totalChecks - successfulChecks,
    uptimePercentage: calculateUptimePercentage(successfulChecks, totalChecks),
    averageLatencyMs:
      latencySampleCount === 0
        ? null
        : roundToTwoDecimalPlaces(latencyTotalMs / latencySampleCount),
    latestCheck: latestCheck ? toLatestCheckSummary(latestCheck) : null,
  };
}

export class MetricsService {
  public constructor(
    private readonly checkResultRepository: MetricsCheckResultRepository,
    private readonly incidentRepository: MetricsIncidentRepository,
    private readonly monitorRepository: MetricsMonitorRepository,
  ) {}

  public async listChecks(
    userId: string,
    monitorId: string,
    options: CheckHistoryOptions,
    range: EffectiveTimeRange,
  ): Promise<CheckHistoryResponse> {
    const monitor = await this.monitorRepository.findOwnedById(userId, monitorId);

    if (!monitor) {
      throw monitorNotFoundError();
    }

    const repositoryRequest = {
      userId,
      monitorId,
      from: range.from,
      to: range.to,
      skip: (options.page - 1) * options.limit,
      limit: options.limit,
      ...(options.region === undefined ? {} : { region: options.region }),
    };
    const page = await this.checkResultRepository.listOwnedHistory(repositoryRequest);

    return {
      checks: page.checks.map(toSafeCheckResult),
      range: responseRange(range),
      pagination: {
        page: options.page,
        limit: options.limit,
        total: page.total,
        totalPages: Math.ceil(page.total / options.limit),
      },
    };
  }

  public async getMetrics(
    userId: string,
    monitorId: string,
    range: EffectiveTimeRange,
  ): Promise<MonitorMetricsResponse> {
    const monitor = await this.monitorRepository.findOwnedById(userId, monitorId);

    if (!monitor) {
      throw monitorNotFoundError();
    }

    const ownedRange: OwnedCheckRange = {
      userId,
      monitorId,
      from: range.from,
      to: range.to,
    };
    const [aggregates, latencyValues, latestChecks, incidentPage] = await Promise.all([
      this.checkResultRepository.summarizeOwnedRange(ownedRange),
      this.checkResultRepository.listOwnedLatencyValues(ownedRange),
      this.checkResultRepository.listLatestOwnedByRegions(ownedRange, monitor.regions),
      this.incidentRepository.listOwnedByMonitor(userId, monitorId, 0, RECENT_INCIDENT_LIMIT),
    ]);
    const aggregateByRegion = new Map(aggregates.map((aggregate) => [aggregate.region, aggregate]));
    const latestByRegion = new Map(latestChecks.map((check) => [check.region, check]));
    const totalChecks = aggregates.reduce((sum, aggregate) => sum + aggregate.totalChecks, 0);
    const successfulChecks = aggregates.reduce(
      (sum, aggregate) => sum + aggregate.successfulChecks,
      0,
    );

    return {
      monitor: {
        id: monitor.id,
        name: monitor.name,
        status: monitor.status,
        isPaused: monitor.isPaused,
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
        regions: [...monitor.regions],
      },
      range: responseRange(range),
      totals: {
        checks: totalChecks,
        successfulChecks,
        failedChecks: totalChecks - successfulChecks,
      },
      uptimePercentage: calculateUptimePercentage(successfulChecks, totalChecks),
      latency: calculateLatencyStatistics(latencyValues),
      regions: monitor.regions.map((region) =>
        regionalSummary(region, aggregateByRegion.get(region), latestByRegion.get(region)),
      ),
      recentIncidents: incidentPage.incidents.slice(0, RECENT_INCIDENT_LIMIT).map((incident) => ({
        id: incident.id,
        status: incident.status,
        openedAt: incident.openedAt.toISOString(),
        resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        triggerReason: incident.triggerReason,
      })),
    };
  }
}
