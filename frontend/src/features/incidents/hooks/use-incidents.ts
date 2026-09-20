import { useQuery } from '@tanstack/react-query';

import { incidentApi } from '../api/incident-api';
import { incidentKeys, monitorIncidentKeys } from '../api/incident-keys';

export function useMonitorIncidents(monitorId: string, page: number, limit: number) {
  return useQuery({
    queryKey: monitorIncidentKeys.list(monitorId, page, limit),
    queryFn: () => incidentApi.list(monitorId, page, limit),
  });
}

export function useIncident(incidentId: string) {
  return useQuery({
    queryKey: incidentKeys.detail(incidentId),
    queryFn: () => incidentApi.get(incidentId),
  });
}
