import { httpClient } from '../../../api/http-client';
import {
  incidentListResponseSchema,
  incidentResponseSchema,
  type Incident,
  type IncidentPage,
} from './incident-contracts';

export const incidentApi = {
  list(monitorId: string, page: number, limit: number): Promise<IncidentPage> {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    return httpClient.request(`/monitors/${monitorId}/incidents?${query.toString()}`, {
      responseSchema: incidentListResponseSchema,
    });
  },

  async get(incidentId: string): Promise<Incident> {
    const response = await httpClient.request(`/incidents/${incidentId}`, {
      responseSchema: incidentResponseSchema,
    });
    return response.incident;
  },
};
