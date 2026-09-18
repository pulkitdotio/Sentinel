import type { CheckErrorType } from '../../database/models/check-result';
import type { CheckResultRecord } from '../checks/check-result-repository';
import type { MonitorStatus } from '../../database/models/monitor';

export interface RegionalHealthEvidence {
  region: string;
  hasResult: boolean;
  latestScheduledAt: Date | null;
  latestSuccess: boolean | null;
  latestLatencyMs: number | null;
  latestErrorType: CheckErrorType | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThresholdMet: boolean;
  recoveryThresholdMet: boolean;
  latencyDegraded: boolean;
}

export function calculateRequiredConsensus(regionCount: number): number {
  if (!Number.isInteger(regionCount) || regionCount < 1) {
    throw new Error('Region count must be a positive integer');
  }

  return Math.floor(regionCount / 2) + 1;
}

export interface HealthEvaluationInput {
  regions: readonly string[];
  histories: ReadonlyMap<string, readonly CheckResultRecord[]>;
  failureThreshold: number;
  recoveryThreshold: number;
  latencyThresholdMs: number;
  isPaused: boolean;
  hasOpenIncident: boolean;
}

export interface HealthEvaluation {
  status: MonitorStatus;
  requiredConsensus: number;
  evidence: RegionalHealthEvidence[];
  shouldOpenIncident: boolean;
  shouldResolveIncident: boolean;
}

function countLeading(
  results: readonly CheckResultRecord[],
  predicate: (result: CheckResultRecord) => boolean,
): number {
  let count = 0;

  for (const result of results) {
    if (!predicate(result)) {
      break;
    }

    count += 1;
  }

  return count;
}

export function deriveRegionalEvidence(
  region: string,
  history: readonly CheckResultRecord[],
  failureThreshold: number,
  recoveryThreshold: number,
  latencyThresholdMs: number,
): RegionalHealthEvidence {
  const orderedHistory = [...history].sort(
    (left, right) => right.scheduledAt.getTime() - left.scheduledAt.getTime(),
  );
  const latest = orderedHistory[0];
  const consecutiveFailures = countLeading(orderedHistory, (result) => !result.success);
  const consecutiveSuccesses = countLeading(orderedHistory, (result) => result.success);

  return {
    region,
    hasResult: latest !== undefined,
    latestScheduledAt: latest?.scheduledAt ?? null,
    latestSuccess: latest?.success ?? null,
    latestLatencyMs: latest?.latencyMs ?? null,
    latestErrorType: latest?.errorType ?? null,
    consecutiveFailures,
    consecutiveSuccesses,
    failureThresholdMet: consecutiveFailures >= failureThreshold,
    recoveryThresholdMet: consecutiveSuccesses >= recoveryThreshold,
    latencyDegraded:
      latest?.success === true &&
      latest.latencyMs !== null &&
      latest.latencyMs > latencyThresholdMs,
  };
}

export function deriveMonitorHealth(input: HealthEvaluationInput): HealthEvaluation {
  const requiredConsensus = calculateRequiredConsensus(input.regions.length);
  const evidence = input.regions.map((region) =>
    deriveRegionalEvidence(
      region,
      input.histories.get(region) ?? [],
      input.failureThreshold,
      input.recoveryThreshold,
      input.latencyThresholdMs,
    ),
  );
  const failureConsensus =
    evidence.filter((region) => region.failureThresholdMet).length >= requiredConsensus;
  const recoveryConsensus =
    evidence.filter((region) => region.recoveryThresholdMet).length >= requiredConsensus;
  const allRegionsHaveEvidence = evidence.every(
    (region) => region.latestScheduledAt !== null,
  );
  const baseStatus: MonitorStatus = !allRegionsHaveEvidence
    ? 'pending'
    : evidence.some(
          (region) => region.latestSuccess === false || region.latencyDegraded,
        )
      ? 'degraded'
      : 'healthy';

  if (input.isPaused) {
    return {
      status: 'paused',
      requiredConsensus,
      evidence,
      shouldOpenIncident: false,
      shouldResolveIncident: false,
    };
  }

  if (input.hasOpenIncident) {
    return {
      status: recoveryConsensus ? baseStatus : 'down',
      requiredConsensus,
      evidence,
      shouldOpenIncident: false,
      shouldResolveIncident: recoveryConsensus,
    };
  }

  if (!allRegionsHaveEvidence) {
    return {
      status: 'pending',
      requiredConsensus,
      evidence,
      shouldOpenIncident: false,
      shouldResolveIncident: false,
    };
  }

  return {
    status: failureConsensus ? 'down' : baseStatus,
    requiredConsensus,
    evidence,
    shouldOpenIncident: failureConsensus,
    shouldResolveIncident: false,
  };
}
