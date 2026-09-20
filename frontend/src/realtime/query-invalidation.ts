import type { Query, QueryClient } from '@tanstack/react-query';

import { aiAnalysisKeys } from '../features/ai/api/ai-keys';
import { monitorCheckKeys } from '../features/checks/api/check-keys';
import { incidentKeys, monitorIncidentKeys } from '../features/incidents/api/incident-keys';
import { monitorMetricKeys } from '../features/metrics/api/metric-keys';
import type { Monitor } from '../features/monitors/api/monitor-contracts';
import { monitorKeys } from '../features/monitors/api/monitor-keys';
import type { MonitorStatusChangedEvent } from './realtime-contracts';

export async function refreshAfterCheck(queryClient: QueryClient, monitorId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: monitorMetricKeys.byMonitor(monitorId) }),
    queryClient.invalidateQueries({ queryKey: monitorCheckKeys.byMonitor(monitorId) }),
    queryClient.invalidateQueries({ queryKey: monitorKeys.detail(monitorId), exact: true }),
    queryClient.invalidateQueries({ queryKey: monitorKeys.list(), exact: true }),
  ]);
}

function applyStatusChange(monitor: Monitor | undefined, event: MonitorStatusChangedEvent): Monitor | undefined {
  if (!monitor || monitor.id !== event.monitorId || monitor.status !== event.previousStatus) return monitor;

  return {
    ...monitor,
    status: event.status,
    isPaused:
      event.status === 'paused'
        ? true
        : event.previousStatus === 'paused'
          ? false
          : monitor.isPaused,
  };
}

export function patchMonitorStatus(queryClient: QueryClient, event: MonitorStatusChangedEvent): void {
  queryClient.setQueryData<Monitor>(monitorKeys.detail(event.monitorId), (monitor) =>
    applyStatusChange(monitor, event));
  queryClient.setQueryData<Monitor[]>(monitorKeys.list(), (monitors) =>
    monitors?.map((monitor) => applyStatusChange(monitor, event) ?? monitor));
}

export async function refreshAfterStatusChange(
  queryClient: QueryClient,
  monitorId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: monitorKeys.detail(monitorId), exact: true }),
    queryClient.invalidateQueries({ queryKey: monitorKeys.list(), exact: true }),
    queryClient.invalidateQueries({ queryKey: monitorMetricKeys.byMonitor(monitorId) }),
  ]);
}

export async function refreshAfterIncidentOpened(
  queryClient: QueryClient,
  monitorId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: monitorIncidentKeys.byMonitor(monitorId) }),
    queryClient.invalidateQueries({ queryKey: monitorMetricKeys.byMonitor(monitorId) }),
  ]);
}

export async function refreshAfterIncidentResolved(
  queryClient: QueryClient,
  monitorId: string,
  incidentId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId), exact: true }),
    queryClient.invalidateQueries({ queryKey: monitorIncidentKeys.byMonitor(monitorId) }),
    queryClient.invalidateQueries({ queryKey: monitorMetricKeys.byMonitor(monitorId) }),
  ]);
}

export async function refreshAiAnalysis(
  queryClient: QueryClient,
  analysisId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: aiAnalysisKeys.detail(analysisId),
    exact: true,
  });
}

const reconnectActiveRoots = new Set<string>([
  monitorKeys.all[0],
  monitorMetricKeys.all[0],
  monitorCheckKeys.all[0],
  monitorIncidentKeys.all[0],
  incidentKeys.all[0],
  aiAnalysisKeys.all[0],
]);

function isActiveRealtimeQuery(query: Query): boolean {
  const root = query.queryKey[0];
  const isMonitorList = root === monitorKeys.all[0] && query.queryKey[1] === 'list';
  return (
    query.getObserversCount() > 0 &&
    !isMonitorList &&
    typeof root === 'string' &&
    reconnectActiveRoots.has(root)
  );
}

export async function reconcileAfterReconnect(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: monitorKeys.list(), exact: true }),
    queryClient.invalidateQueries({ predicate: isActiveRealtimeQuery }),
  ]);
}
