import { describe, expect, it } from 'vitest';

import {
  calculateLatencyStatistics,
  calculateUptimePercentage,
  nearestRankPercentile,
} from '../../src/modules/metrics/metrics-math';

describe('metrics math', () => {
  it('calculates deterministic uptime for all-success, mixed, all-failed, and empty data', () => {
    expect(calculateUptimePercentage(3, 3)).toBe(100);
    expect(calculateUptimePercentage(2, 3)).toBe(66.67);
    expect(calculateUptimePercentage(0, 3)).toBe(0);
    expect(calculateUptimePercentage(0, 0)).toBeNull();
  });

  it('returns null percentiles for empty input', () => {
    expect(nearestRankPercentile([], 0.5)).toBeNull();
  });

  it('returns the single value for p50, p95, and p99', () => {
    expect(calculateLatencyStatistics([184])).toEqual({
      sampleCount: 1,
      averageMs: 184,
      p50Ms: 184,
      p95Ms: 184,
      p99Ms: 184,
    });
  });

  it('uses nearest rank for odd-sized unsorted input', () => {
    const values = [50, 10, 30, 20, 40];

    expect(nearestRankPercentile(values, 0.5)).toBe(30);
    expect(nearestRankPercentile(values, 0.95)).toBe(50);
    expect(nearestRankPercentile(values, 0.99)).toBe(50);
  });

  it('uses the upper nearest rank for an even-sized sample', () => {
    expect(nearestRankPercentile([40, 10, 30, 20], 0.5)).toBe(20);
  });

  it('handles the nearest-rank percentile boundaries', () => {
    expect(nearestRankPercentile([20, 10, 30], 0.01)).toBe(10);
    expect(nearestRankPercentile([20, 10, 30], 1)).toBe(30);
    expect(() => nearestRankPercentile([1], 0)).toThrow(RangeError);
    expect(() => nearestRankPercentile([1], 1.01)).toThrow(RangeError);
  });

  it('calculates and rounds average latency without mutating the input', () => {
    const values = [200, 100, 101];

    expect(calculateLatencyStatistics(values)).toMatchObject({
      sampleCount: 3,
      averageMs: 133.67,
    });
    expect(values).toEqual([200, 100, 101]);
  });

  it('rounds selected percentile samples to at most two decimal places for API output', () => {
    expect(calculateLatencyStatistics([10.126, 20.555])).toMatchObject({
      p50Ms: 10.13,
      p95Ms: 20.56,
      p99Ms: 20.56,
    });
  });

  it('returns stable null latency metrics when there are no samples', () => {
    expect(calculateLatencyStatistics([])).toEqual({
      sampleCount: 0,
      averageMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    });
  });
});
