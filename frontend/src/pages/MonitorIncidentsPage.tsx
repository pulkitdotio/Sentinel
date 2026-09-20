import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Pagination } from '../components/app/Pagination';
import { OperationalError, OperationalSkeleton } from '../features/metrics/components/OperationalStates';
import { useMonitorIncidents } from '../features/incidents/hooks/use-incidents';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { useMonitorWorkspace } from '../features/monitors/monitor-workspace-context';
import { formatDuration, formatExactDate } from '../lib/dates';

const INCIDENT_PAGE_SIZE = 20;

function normalizePage(value: string | null): number {
  const page = Number(value ?? '1');
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function MonitorIncidentsPage() {
  const monitor = useMonitorWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPage = searchParams.get('page');
  const page = normalizePage(rawPage);
  const incidentsQuery = useMonitorIncidents(monitor.id, page, INCIDENT_PAGE_SIZE);

  useEffect(() => {
    if (rawPage === null || rawPage === String(page)) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [page, rawPage, searchParams, setSearchParams]);

  useEffect(() => {
    const totalPages = incidentsQuery.data?.pagination.totalPages;
    if (totalPages === undefined || totalPages === 0 || page <= totalPages) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(totalPages));
    setSearchParams(next, { replace: true });
  }, [incidentsQuery.data?.pagination.totalPages, page, searchParams, setSearchParams]);

  const updatePage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete('page'); else next.set('page', String(nextPage));
    setSearchParams(next);
  };

  return (
    <div className="monitor-workspace__content">
      <div className="operational-toolbar"><div><h2>Incident history</h2><p>System-derived outage consensus and recovery records.</p></div></div>
      {incidentsQuery.isPending ? (
        <OperationalSkeleton label="Loading incidents" rows={5} />
      ) : incidentsQuery.isError ? (
        <OperationalError message={monitorErrorMessage(incidentsQuery.error)} onRetry={() => void incidentsQuery.refetch()} />
      ) : incidentsQuery.data.incidents.length === 0 ? (
        <div className="operational-empty operational-empty--large"><strong>No incidents recorded</strong><span>No outage consensus has been recorded for this monitor.</span></div>
      ) : (
        <div className="incident-table" role="table" aria-label="Incident history">
          <div className="incident-table__head" role="row"><span role="columnheader">Status</span><span role="columnheader">Opened</span><span role="columnheader">Resolved / ongoing</span><span role="columnheader">Duration</span><span role="columnheader">Trigger</span><span /></div>
          {incidentsQuery.data.incidents.map((incident) => (
            <Link className="incident-table__row" role="row" to={`/app/incidents/${incident.id}`} key={incident.id}>
              <span role="cell" data-label="Status" className={`incident-status incident-status--${incident.status}`}>{incident.status === 'open' ? 'Open' : 'Resolved'}</span>
              <time role="cell" data-label="Opened" dateTime={incident.openedAt}>{formatExactDate(incident.openedAt)}</time>
              <span role="cell" data-label="Resolved / ongoing">{incident.resolvedAt ? <time dateTime={incident.resolvedAt}>{formatExactDate(incident.resolvedAt)}</time> : 'Ongoing'}</span>
              <code role="cell" data-label="Duration">{formatDuration(incident.openedAt, incident.resolvedAt)}</code>
              <span role="cell" data-label="Trigger">{incident.triggerReason}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
      {incidentsQuery.data ? <Pagination label="Incident history pagination" page={incidentsQuery.data.pagination.page} totalPages={incidentsQuery.data.pagination.totalPages} disabled={incidentsQuery.isFetching} onPageChange={updatePage} /> : null}
    </div>
  );
}
