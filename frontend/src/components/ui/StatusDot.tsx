import { cn } from '../../lib/cn';

interface StatusDotProps {
  label: string;
  status?: 'healthy' | 'degraded' | 'down' | 'pending';
}

export function StatusDot({ label, status = 'healthy' }: StatusDotProps) {
  return (
    <span className="status-label">
      <span className={cn('status-dot', `status-dot--${status}`)} aria-hidden="true" />
      {label}
    </span>
  );
}
