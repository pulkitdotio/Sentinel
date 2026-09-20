import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { monitorCheckKeys } from '../../checks/api/check-keys';
import { monitorIncidentKeys } from '../../incidents/api/incident-keys';
import { monitorMetricKeys } from '../../metrics/api/metric-keys';
import { monitorApi } from '../api/monitor-api';
import type { MonitorConfiguration, UpdateMonitorRequest } from '../api/monitor-contracts';
import { monitorKeys } from '../api/monitor-keys';

export function useMonitorList() {
  return useQuery({
    queryKey: monitorKeys.list(),
    queryFn: () => monitorApi.list(),
  });
}

export function useMonitor(monitorId: string, enabled = true) {
  return useQuery({
    queryKey: monitorKeys.detail(monitorId),
    queryFn: () => monitorApi.get(monitorId),
    enabled: enabled && monitorId.length > 0,
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MonitorConfiguration) => monitorApi.create(input),
    onSuccess: async (monitor) => {
      queryClient.setQueryData(monitorKeys.detail(monitor.id), monitor);
      await queryClient.invalidateQueries({ queryKey: monitorKeys.list() });
    },
  });
}

export function useUpdateMonitor(monitorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMonitorRequest) => monitorApi.update(monitorId, input),
    onSuccess: async (monitor) => {
      queryClient.setQueryData(monitorKeys.detail(monitorId), monitor);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: monitorKeys.list() }),
        queryClient.invalidateQueries({ queryKey: monitorMetricKeys.byMonitor(monitorId) }),
        queryClient.invalidateQueries({ queryKey: monitorCheckKeys.byMonitor(monitorId) }),
      ]);
    },
  });
}

function useStateMutation(monitorId: string, action: 'pause' | 'resume') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => monitorApi[action](monitorId),
    onSuccess: async (monitor) => {
      queryClient.setQueryData(monitorKeys.detail(monitorId), monitor);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: monitorKeys.list() }),
        queryClient.invalidateQueries({ queryKey: monitorMetricKeys.byMonitor(monitorId) }),
      ]);
    },
  });
}

export function usePauseMonitor(monitorId: string) {
  return useStateMutation(monitorId, 'pause');
}

export function useResumeMonitor(monitorId: string) {
  return useStateMutation(monitorId, 'resume');
}

export function useDeleteMonitor(monitorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => monitorApi.delete(monitorId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: monitorKeys.detail(monitorId) });
      queryClient.removeQueries({ queryKey: monitorMetricKeys.byMonitor(monitorId) });
      queryClient.removeQueries({ queryKey: monitorCheckKeys.byMonitor(monitorId) });
      queryClient.removeQueries({ queryKey: monitorIncidentKeys.byMonitor(monitorId) });
      await queryClient.invalidateQueries({ queryKey: monitorKeys.list() });
    },
  });
}
