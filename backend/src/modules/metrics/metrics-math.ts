export interface LatencyStatistics {
  sampleCount: number;
  averageMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

export function roundToTwoDecimalPlaces(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : roundToTwoDecimalPlaces(value);
}

export function calculateUptimePercentage(
  successfulChecks: number,
  totalChecks: number,
): number | null {
  if (totalChecks === 0) {
    return null;
  }

  return roundToTwoDecimalPlaces((successfulChecks / totalChecks) * 100);
}

export function nearestRankPercentile(
  values: readonly number[],
  percentile: number,
): number | null {
  if (percentile <= 0 || percentile > 1) {
    throw new RangeError('percentile must be greater than 0 and at most 1');
  }

  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.ceil(percentile * sortedValues.length) - 1;
  return sortedValues[index] ?? null;
}

export function calculateLatencyStatistics(values: readonly number[]): LatencyStatistics {
  if (values.length === 0) {
    return {
      sampleCount: 0,
      averageMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    };
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    sampleCount: values.length,
    averageMs: roundToTwoDecimalPlaces(average),
    p50Ms: roundNullable(nearestRankPercentile(values, 0.5)),
    p95Ms: roundNullable(nearestRankPercentile(values, 0.95)),
    p99Ms: roundNullable(nearestRankPercentile(values, 0.99)),
  };
}
