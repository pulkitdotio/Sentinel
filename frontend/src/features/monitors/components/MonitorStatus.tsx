import type { MonitorStatus as MonitorStatusValue } from '../api/monitor-contracts';

const labels: Record<MonitorStatusValue, string> = {
  pending: 'Pending',
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  paused: 'Paused',
};

export function MonitorStatus({ status }: { status: MonitorStatusValue }) {
  return (
    <span className={`monitor-status monitor-status--${status}`}>
      <span aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
