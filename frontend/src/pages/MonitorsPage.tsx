import { Plus } from 'lucide-react';

import { ButtonRouteLink } from '../components/ui/Button';
import { MonitorList } from '../features/monitors/components/MonitorList';
import { MonitorEmptyState, MonitorErrorState, MonitorListSkeleton } from '../features/monitors/components/MonitorStates';
import { useMonitorList } from '../features/monitors/hooks/use-monitors';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';

export function MonitorsPage() {
  const monitorsQuery = useMonitorList();
  return (
    <div className="workspace-page">
      <header className="workspace-heading workspace-heading--with-action">
        <div><p className="eyebrow">Workspace / Monitors</p><h1>Monitors</h1><p>HTTP endpoints currently configured for regional checks.</p></div>
        <ButtonRouteLink to="/app/monitors/new"><Plus size={15} aria-hidden="true" /> New monitor</ButtonRouteLink>
      </header>
      <section className="workspace-section workspace-section--flush">
        {monitorsQuery.isPending ? <MonitorListSkeleton /> : null}
        {monitorsQuery.isError ? <MonitorErrorState message={monitorErrorMessage(monitorsQuery.error)} onRetry={() => void monitorsQuery.refetch()} /> : null}
        {monitorsQuery.isSuccess && monitorsQuery.data.length === 0 ? <MonitorEmptyState compact /> : null}
        {monitorsQuery.isSuccess && monitorsQuery.data.length > 0 ? <MonitorList monitors={monitorsQuery.data} /> : null}
      </section>
    </div>
  );
}
