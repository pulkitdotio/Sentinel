import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Pagination } from '../components/app/Pagination';
import { CheckTable } from '../features/checks/components/CheckTable';
import { useMonitorChecks } from '../features/checks/hooks/use-checks';
import { OperationalError, OperationalSkeleton } from '../features/metrics/components/OperationalStates';
import { TimeRangeControl } from '../features/metrics/components/TimeRangeControl';
import { useMonitorTimeRange } from '../features/metrics/hooks/use-monitor-time-range';
import { regionLabel } from '../features/metrics/metric-formatters';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { useMonitorWorkspace } from '../features/monitors/monitor-workspace-context';

const CHECK_PAGE_SIZE = 25;

function normalizePage(value: string | null): number {
  const page = Number(value ?? '1');
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function MonitorChecksPage() {
  const monitor = useMonitorWorkspace();
  const { preset, range, setPreset } = useMonitorTimeRange();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawRegion = searchParams.get('region');
  const region = rawRegion !== null && monitor.regions.includes(rawRegion) ? rawRegion : undefined;
  const rawPage = searchParams.get('page');
  const page = normalizePage(rawPage);
  const filters = useMemo(() => ({ range, region, page, limit: CHECK_PAGE_SIZE }), [page, range, region]);
  const checksQuery = useMonitorChecks(monitor.id, filters);

  useEffect(() => {
    if ((rawRegion === null || rawRegion === region) && (rawPage === null || rawPage === String(page))) return;
    const next = new URLSearchParams(searchParams);
    if (rawRegion !== null && region === undefined) next.delete('region');
    if (rawPage !== null && rawPage !== String(page)) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [page, rawPage, rawRegion, region, searchParams, setSearchParams]);

  useEffect(() => {
    const totalPages = checksQuery.data?.pagination.totalPages;
    if (totalPages === undefined || totalPages === 0 || page <= totalPages) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(totalPages));
    setSearchParams(next, { replace: true });
  }, [checksQuery.data?.pagination.totalPages, page, searchParams, setSearchParams]);

  const updateRegion = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === '') next.delete('region'); else next.set('region', value);
    next.delete('page');
    setSearchParams(next);
  };

  const updatePage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete('page'); else next.set('page', String(nextPage));
    setSearchParams(next);
  };

  return (
    <div className="monitor-workspace__content">
      <div className="operational-toolbar">
        <div><h2>Check history</h2><p>Newest-first regional probe evidence, paginated by the backend.</p></div>
        <div className="check-filters">
          <TimeRangeControl value={preset} onChange={setPreset} />
          <label>Region<select value={region ?? ''} onChange={(event) => updateRegion(event.target.value)}><option value="">All regions</option>{monitor.regions.map((value) => <option value={value} key={value}>{regionLabel(value)}</option>)}</select></label>
        </div>
      </div>

      {checksQuery.isPending ? (
        <OperationalSkeleton label="Loading check history" rows={7} />
      ) : checksQuery.isError ? (
        <OperationalError message={monitorErrorMessage(checksQuery.error)} onRetry={() => void checksQuery.refetch()} />
      ) : checksQuery.data.checks.length === 0 ? (
        <div className="operational-empty operational-empty--large">
          <strong>{monitor.lastCheckedAt === null ? 'Waiting for first regional checks.' : region === undefined ? 'No checks in this time range.' : 'No checks match this view.'}</strong>
          <span>{monitor.lastCheckedAt === null ? 'Sentinel will show evidence here after the first completed probes.' : 'Try another region or a wider time range.'}</span>
        </div>
      ) : (
        <CheckTable checks={checksQuery.data.checks} />
      )}

      {checksQuery.data ? (
        <Pagination
          label="Check history pagination"
          page={checksQuery.data.pagination.page}
          totalPages={checksQuery.data.pagination.totalPages}
          disabled={checksQuery.isFetching}
          onPageChange={updatePage}
        />
      ) : null}
    </div>
  );
}
