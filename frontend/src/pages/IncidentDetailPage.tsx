import { ArrowLeft } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError } from '../api/http-client';
import { IncidentAiSummary } from '../features/ai/components/IncidentAiSummary';
import { checkErrorLabel } from '../features/checks/check-formatters';
import type { Incident } from '../features/incidents/api/incident-contracts';
import { useIncident } from '../features/incidents/hooks/use-incidents';
import { OperationalError, OperationalSkeleton } from '../features/metrics/components/OperationalStates';
import { regionLabel } from '../features/metrics/metric-formatters';
import { useMonitor } from '../features/monitors/hooks/use-monitors';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { formatDuration, formatExactDateWithSeconds } from '../lib/dates';

export function IncidentDetailPage() {
  const { incidentId = '' } = useParams();
  const incidentQuery = useIncident(incidentId);

  if (incidentQuery.isPending) return <div className="workspace-page"><OperationalSkeleton label="Loading incident" rows={6} /></div>;
  if (incidentQuery.isError) {
    if (incidentQuery.error instanceof ApiError && incidentQuery.error.code === 'INCIDENT_NOT_FOUND') {
      return (
        <div className="workspace-page"><section className="resource-not-found"><p className="eyebrow">Incident unavailable</p><h1>Incident not found.</h1><p>It may have been removed, or it is not available in this workspace.</p><Link className="button button--secondary" to="/app/monitors"><ArrowLeft size={14} aria-hidden="true" /> Back to monitors</Link></section></div>
      );
    }
    return <div className="workspace-page"><OperationalError message={monitorErrorMessage(incidentQuery.error)} onRetry={() => void incidentQuery.refetch()} /></div>;
  }

  return <IncidentDetail incident={incidentQuery.data} />;
}

function IncidentDetail({ incident }: { incident: Incident }) {
  const monitorQuery = useMonitor(incident.monitorId);
  const enterStyle = (index: number) => ({ '--app-enter-delay': `${String(index * 65)}ms` }) as CSSProperties;

  return (
    <div className="workspace-page incident-detail-page">
      <Link className="workspace-back-link" to={`/app/monitors/${incident.monitorId}/incidents`}><ArrowLeft size={14} aria-hidden="true" /> Incident history</Link>
      <header className="incident-detail-heading">
        <div><p className="eyebrow">Incident / {incident.id}</p><h1>{incident.status === 'open' ? 'Active incident' : 'Resolved incident'}</h1><p>{incident.triggerReason}</p></div>
        <span className={`incident-status incident-status--${incident.status}`}>{incident.status === 'open' ? 'Open' : 'Resolved'}</span>
      </header>

      <section className="incident-summary-grid app-enter-sequence" aria-label="Incident summary">
        <div className="app-enter-item" style={enterStyle(0)}><span>Monitor</span><strong>{monitorQuery.data?.name ?? incident.monitorId}</strong>{monitorQuery.data ? <Link to={`/app/monitors/${incident.monitorId}`}>Open monitor</Link> : null}</div>
        <div className="app-enter-item" style={enterStyle(1)}><span>Opened</span><strong>{formatExactDateWithSeconds(incident.openedAt)}</strong></div>
        <div className="app-enter-item" style={enterStyle(2)}><span>Resolved</span><strong>{incident.resolvedAt ? formatExactDateWithSeconds(incident.resolvedAt) : 'Ongoing'}</strong></div>
        <div className="app-enter-item" style={enterStyle(3)}><span>Duration</span><strong>{formatDuration(incident.openedAt, incident.resolvedAt)}</strong></div>
      </section>

      <section className="operational-section incident-evidence">
        <div className="operational-section__heading"><div><h2>Opening evidence</h2><p>Deterministic regional evidence captured when this incident opened.</p></div></div>
        <div className="incident-thresholds">
          <div><span>Consensus required</span><strong>{incident.openingStatusEvidence.requiredConsensus} regions</strong></div>
          <div><span>Failure threshold</span><strong>{incident.openingStatusEvidence.failureThreshold} consecutive checks</strong></div>
        </div>
        <div className="incident-region-evidence">
          {incident.openingStatusEvidence.regions.map((region) => (
            <article key={region.region}>
              <div><strong>{regionLabel(region.region)}</strong><code>{region.region}</code></div>
              <span>{region.consecutiveFailures} consecutive failures</span>
              <span>{checkErrorLabel(region.latestErrorType)}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="operational-section incident-timeline-section">
        <div className="operational-section__heading"><div><h2>Timeline</h2><p>Lifecycle events recorded by Sentinel’s incident engine.</p></div></div>
        <ol className="incident-timeline app-enter-sequence">
          {incident.events.map((event, index) => (
            <li className="app-enter-item" key={`${event.type}-${event.at}-${String(index)}`} style={enterStyle(index)}>
              <span aria-hidden="true" />
              <time dateTime={event.at}>{formatExactDateWithSeconds(event.at)}</time>
              <strong>{event.type === 'opened' ? 'Incident opened' : 'Incident resolved'}</strong>
              <p>{event.message}</p>
            </li>
          ))}
        </ol>
      </section>

      <IncidentAiSummary incident={incident} />
    </div>
  );
}
