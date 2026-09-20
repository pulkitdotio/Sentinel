import { httpClient } from '../../../api/http-client';
import type { IsoTimeRange } from '../../metrics/time-range';
import { checkHistoryResponseSchema, type CheckHistoryPage } from './check-contracts';

export interface CheckHistoryFilters {
  range: IsoTimeRange;
  region?: string;
  page: number;
  limit: number;
}

export const checkApi = {
  list(monitorId: string, filters: CheckHistoryFilters): Promise<CheckHistoryPage> {
    const query = new URLSearchParams({
      from: filters.range.from,
      to: filters.range.to,
      page: String(filters.page),
      limit: String(filters.limit),
    });
    if (filters.region !== undefined) query.set('region', filters.region);
    return httpClient.request(`/monitors/${monitorId}/checks?${query.toString()}`, {
      responseSchema: checkHistoryResponseSchema,
    });
  },
};
