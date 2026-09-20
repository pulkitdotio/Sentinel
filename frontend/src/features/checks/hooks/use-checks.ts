import { useQuery } from '@tanstack/react-query';

import { checkApi, type CheckHistoryFilters } from '../api/check-api';
import { monitorCheckKeys } from '../api/check-keys';

export function useMonitorChecks(monitorId: string, filters: CheckHistoryFilters) {
  return useQuery({
    queryKey: monitorCheckKeys.list(monitorId, filters),
    queryFn: () => checkApi.list(monitorId, filters),
  });
}
