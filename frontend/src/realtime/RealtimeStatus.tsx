import { useRealtime, type RealtimeConnectionStatus } from './realtime-context';

const statusContent: Record<RealtimeConnectionStatus, string> = {
  connected: 'Live',
  reconnecting: 'Reconnecting',
  disconnected: 'Realtime offline',
};

export function RealtimeStatus({ className }: { className?: string }) {
  const { status } = useRealtime();

  return (
    <div
      className={`realtime-status realtime-status--${status}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      {statusContent[status]}
    </div>
  );
}
