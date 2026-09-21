import { ArrowRight, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { ButtonRouteLink } from '../components/ui/Button';
import { MonitorEmptyState, MonitorErrorState, MonitorListSkeleton } from '../features/monitors/components/MonitorStates';
import { MonitorList } from '../features/monitors/components/MonitorList';
import { useMonitorList } from '../features/monitors/hooks/use-monitors';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { countMonitorStatuses } from '../features/monitors/monitor-summary';

const summaryItems = [
  { key: 'total', label: 'Total monitors' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'degraded', label: 'Degraded' },
  { key: 'down', label: 'Down' },
  { key: 'paused', label: 'Paused' },
  { key: 'pending', label: 'Pending' },
] as const;

export function OverviewPage() {
  const { user } = useAuth();
  const monitorsQuery = useMonitorList();

  return (
    <div className="workspace-page">
      <header className="workspace-heading workspace-heading--with-action">
        <div><p className="eyebrow">Workspace / Overview</p><h1>Monitoring overview</h1><p>Current endpoint state for {user?.name}'s workspace.</p></div>
        <ButtonRouteLink to="/app/monitors/new"><Plus size={15} aria-hidden="true" /> New monitor</ButtonRouteLink>
      </header>

      {monitorsQuery.isPending ? (
        <>
          <div className="summary-grid" role="status" aria-label="Loading overview">
            {summaryItems.map((item) => <div className="summary-card summary-card--loading" key={item.key}><span /><strong /></div>)}
          </div>
          <section className="workspace-section"><div className="workspace-section__heading"><h2>Monitors</h2></div><MonitorListSkeleton rows={4} /></section>
        </>
      ) : monitorsQuery.isError ? (
        <MonitorErrorState message={monitorErrorMessage(monitorsQuery.error)} onRetry={() => void monitorsQuery.refetch()} />
      ) : monitorsQuery.data.length === 0 ? (
        <MonitorEmptyState />
      ) : (
        <OverviewContent monitors={monitorsQuery.data} />
      )}
    </div>
  );
}

function OverviewContent({ monitors }: { monitors: NonNullable<ReturnType<typeof useMonitorList>['data']> }) {
  const counts = countMonitorStatuses(monitors);
  return (
    <>
      <section className="summary-grid app-enter-sequence" aria-label="Monitor status summary">
        {summaryItems.map((item, index) => (
          <article
            className={`summary-card summary-card--${item.key} app-enter-item`}
            key={item.key}
            style={{ '--app-enter-delay': `${String(index * 45)}ms` } as CSSProperties}
          >
            <span>{item.label}</span><strong>{counts[item.key]}</strong>
          </article>
        ))}
      </section>
      <section className="workspace-section">
        <div className="workspace-section__heading">
          <div><h2>Primary monitors</h2><p>Most recently added endpoints and their current aggregate state.</p></div>
          <Link to="/app/monitors">All monitors <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <MonitorList monitors={monitors} limit={5} />
      </section>
    </>
  );
}
