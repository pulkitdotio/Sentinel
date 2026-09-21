import { CircleAlert, RefreshCw } from 'lucide-react';

export function OperationalSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div className="operational-skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function OperationalError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="operational-error" role="alert">
      <div className="operational-state-icon operational-state-icon--error" aria-hidden="true"><CircleAlert size={19} /></div>
      <p className="eyebrow">Data unavailable</p>
      <h2>This operational view could not be loaded.</h2>
      <p>{message}</p>
      <button type="button" className="button button--secondary" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" /> Try again
      </button>
    </section>
  );
}
