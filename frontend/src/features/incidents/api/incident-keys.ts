export const monitorIncidentKeys = {
  all: ['monitor-incidents'] as const,
  byMonitor: (monitorId: string) => [...monitorIncidentKeys.all, monitorId] as const,
  list: (monitorId: string, page: number, limit: number) =>
    [...monitorIncidentKeys.byMonitor(monitorId), 'list', page, limit] as const,
};

export const incidentKeys = {
  all: ['incidents'] as const,
  detail: (incidentId: string) => [...incidentKeys.all, 'detail', incidentId] as const,
};
