import { httpClient } from '../../../api/http-client';
import type { IsoTimeRange } from '../time-range';
import { monitorMetricsResponseSchema, type MonitorMetrics } from './metric-contracts';

export const metricApi = {
  get(monitorId: string, range: IsoTimeRange): Promise<MonitorMetrics> {
    const query = new URLSearchParams({ from: range.from, to: range.to });
    return httpClient.request(`/monitors/${monitorId}/metrics?${query.toString()}`, {
      responseSchema: monitorMetricsResponseSchema,
    });
  },
};
