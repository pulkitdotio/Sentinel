import type { Monitor, MonitorStatus } from './api/monitor-contracts';

export type MonitorCounts = Record<MonitorStatus | 'total', number>;

export function countMonitorStatuses(monitors: Monitor[]): MonitorCounts {
  return monitors.reduce<MonitorCounts>(
    (counts, monitor) => ({
      ...counts,
      total: counts.total + 1,
      [monitor.status]: counts[monitor.status] + 1,
    }),
    { total: 0, pending: 0, healthy: 0, degraded: 0, down: 0, paused: 0 },
  );
}
