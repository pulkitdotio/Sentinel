import type { CheckHistoryFilters } from './check-api';

export const monitorCheckKeys = {
  all: ['monitor-checks'] as const,
  byMonitor: (monitorId: string) => [...monitorCheckKeys.all, monitorId] as const,
  list: (monitorId: string, filters: CheckHistoryFilters) => [
    ...monitorCheckKeys.byMonitor(monitorId),
    'list',
    filters.range.from,
    filters.range.to,
    filters.region ?? 'all',
    filters.page,
    filters.limit,
  ] as const,
};
