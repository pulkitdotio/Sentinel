import { httpClient } from '../../../api/http-client';
import {
  monitorListResponseSchema,
  monitorResponseSchema,
  type Monitor,
  type MonitorConfiguration,
  type UpdateMonitorRequest,
} from './monitor-contracts';

export const monitorApi = {
  async list(): Promise<Monitor[]> {
    const response = await httpClient.request('/monitors', {
      responseSchema: monitorListResponseSchema,
    });
    return response.monitors;
  },

  async get(monitorId: string): Promise<Monitor> {
    const response = await httpClient.request(`/monitors/${monitorId}`, {
      responseSchema: monitorResponseSchema,
    });
    return response.monitor;
  },

  async create(input: MonitorConfiguration): Promise<Monitor> {
    const response = await httpClient.request('/monitors', {
      method: 'POST',
      body: input,
      responseSchema: monitorResponseSchema,
    });
    return response.monitor;
  },

  async update(monitorId: string, input: UpdateMonitorRequest): Promise<Monitor> {
    const response = await httpClient.request(`/monitors/${monitorId}`, {
      method: 'PATCH',
      body: input,
      responseSchema: monitorResponseSchema,
    });
    return response.monitor;
  },

  async pause(monitorId: string): Promise<Monitor> {
    const response = await httpClient.request(`/monitors/${monitorId}/pause`, {
      method: 'POST',
      responseSchema: monitorResponseSchema,
    });
    return response.monitor;
  },

  async resume(monitorId: string): Promise<Monitor> {
    const response = await httpClient.request(`/monitors/${monitorId}/resume`, {
      method: 'POST',
      responseSchema: monitorResponseSchema,
    });
    return response.monitor;
  },

  delete(monitorId: string): Promise<void> {
    return httpClient.request(`/monitors/${monitorId}`, { method: 'DELETE' });
  },
};
