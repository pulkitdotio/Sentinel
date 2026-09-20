import { ArrowLeft, ExternalLink, Pause, Play } from 'lucide-react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';

import { ApiError } from '../api/http-client';
import type { Monitor } from '../features/monitors/api/monitor-contracts';
import { MonitorDetailSkeleton, MonitorErrorState } from '../features/monitors/components/MonitorStates';
import { MonitorStatus } from '../features/monitors/components/MonitorStatus';
import { useMonitor, usePauseMonitor, useResumeMonitor } from '../features/monitors/hooks/use-monitors';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { MonitorWorkspaceContext } from '../features/monitors/monitor-workspace-context';

const monitorNavigation = [
  { label: 'Overview', path: '' },
  { label: 'Checks', path: 'checks' },
  { label: 'Incidents', path: 'incidents' },
  { label: 'Configuration', path: 'configuration' },
] as const;

export function MonitorDetailPage() {
  const { monitorId = '' } = useParams();
  const monitorQuery = useMonitor(monitorId);

  if (monitorQuery.isPending) return <div className="workspace-page"><MonitorDetailSkeleton /></div>;
  if (monitorQuery.isError) {
    if (monitorQuery.error instanceof ApiError && monitorQuery.error.code === 'MONITOR_NOT_FOUND') {
      return <MonitorNotFound />;
    }
    return <div className="workspace-page"><MonitorErrorState message={monitorErrorMessage(monitorQuery.error)} onRetry={() => void monitorQuery.refetch()} /></div>;
  }

  return <MonitorWorkspace monitor={monitorQuery.data} />;
}

function MonitorNotFound() {
  return (
    <div className="workspace-page">
      <section className="resource-not-found">
        <p className="eyebrow">Monitor unavailable</p>
        <h1>Monitor not found.</h1>
        <p>It may have been removed, or it is not available in this workspace.</p>
        <Link className="button button--secondary" to="/app/monitors"><ArrowLeft size={14} aria-hidden="true" /> Back to monitors</Link>
      </section>
    </div>
  );
}

function MonitorWorkspace({ monitor }: { monitor: Monitor }) {
  const pauseMonitor = usePauseMonitor(monitor.id);
  const resumeMonitor = useResumeMonitor(monitor.id);
  const stateMutation = monitor.isPaused ? resumeMonitor : pauseMonitor;

  const togglePaused = async () => {
    pauseMonitor.reset();
    resumeMonitor.reset();
    await stateMutation.mutateAsync();
  };

  return (
    <MonitorWorkspaceContext.Provider value={monitor}>
      <div className="workspace-page monitor-workspace">
        <Link className="workspace-back-link" to="/app/monitors"><ArrowLeft size={14} aria-hidden="true" /> All monitors</Link>
        <header className="monitor-detail-heading">
          <div>
            <p className="eyebrow">Monitor workspace</p>
            <div className="monitor-detail-heading__title"><h1>{monitor.name}</h1><MonitorStatus status={monitor.status} /></div>
            <a href={monitor.url} target="_blank" rel="noreferrer" title={monitor.url}>{monitor.url}<ExternalLink size={13} aria-hidden="true" /></a>
          </div>
          <div className="monitor-detail-heading__actions">
            <button className="button button--secondary" type="button" disabled={stateMutation.isPending} onClick={() => void togglePaused()}>
              {monitor.isPaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
              {stateMutation.isPending ? (monitor.isPaused ? 'Resuming…' : 'Pausing…') : (monitor.isPaused ? 'Resume monitoring' : 'Pause monitoring')}
            </button>
          </div>
        </header>

        {stateMutation.isError ? <p className="workspace-action-error" role="alert">{monitorErrorMessage(stateMutation.error)}</p> : null}

        <nav className="monitor-subnav" aria-label="Monitor sections">
          {monitorNavigation.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.path === ''}
              className={({ isActive }) => isActive ? 'is-active' : undefined}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </MonitorWorkspaceContext.Provider>
  );
}
