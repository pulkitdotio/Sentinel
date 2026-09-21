import { CircleAlert, CircleOff, Plus, RefreshCw } from 'lucide-react';

import { ButtonRouteLink } from '../../../components/ui/Button';

export function MonitorListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="monitor-skeleton" role="status" aria-label="Loading monitors">
      {Array.from({ length: rows }, (_, index) => (
        <div className="monitor-skeleton__row" key={index}>
          <span /><span /><span /><span />
        </div>
      ))}
    </div>
  );
}

export function MonitorDetailSkeleton() {
  return (
    <div className="detail-skeleton" role="status" aria-label="Loading monitor">
      <div className="detail-skeleton__heading" />
      <div className="detail-skeleton__meta" />
      <div className="detail-skeleton__grid"><span /><span /><span /></div>
      <div className="detail-skeleton__panel" />
    </div>
  );
}

export function MonitorEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`monitor-empty${compact ? ' monitor-empty--compact' : ''}`}>
      <div className="monitor-empty__signal" aria-hidden="true"><CircleOff size={23} /></div>
      <p className="eyebrow">Awaiting first endpoint</p>
      <h2>Nothing to monitor yet.</h2>
      <p>Add an HTTP endpoint and Sentinel will schedule regional checks automatically.</p>
      <ButtonRouteLink to="/app/monitors/new"><Plus size={15} aria-hidden="true" /> Create your first monitor</ButtonRouteLink>
    </section>
  );
}

interface MonitorErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function MonitorErrorState({ message, onRetry }: MonitorErrorStateProps) {
  return (
    <section className="monitor-error" role="alert">
      <div className="operational-state-icon operational-state-icon--error" aria-hidden="true"><CircleAlert size={19} /></div>
      <span>Request interrupted</span>
      <h2>Monitor data is unavailable.</h2>
      <p>{message}</p>
      <button className="button button--secondary" type="button" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" /> Try again
      </button>
    </section>
  );
}
