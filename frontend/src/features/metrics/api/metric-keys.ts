import type { IsoTimeRange } from '../time-range';

export const monitorMetricKeys = {
  all: ['monitor-metrics'] as const,
  byMonitor: (monitorId: string) => [...monitorMetricKeys.all, monitorId] as const,
  detail: (monitorId: string, range: IsoTimeRange) =>
    [...monitorMetricKeys.byMonitor(monitorId), 'detail', range.from, range.to] as const,
};
