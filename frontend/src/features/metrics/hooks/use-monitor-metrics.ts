import { useQuery } from '@tanstack/react-query';

import { metricApi } from '../api/metric-api';
import { monitorMetricKeys } from '../api/metric-keys';
import type { IsoTimeRange } from '../time-range';

export function useMonitorMetrics(monitorId: string, range: IsoTimeRange) {
  return useQuery({
    queryKey: monitorMetricKeys.detail(monitorId, range),
    queryFn: () => metricApi.get(monitorId, range),
  });
}
