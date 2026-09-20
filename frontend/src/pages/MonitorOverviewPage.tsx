import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CheckTable } from '../features/checks/components/CheckTable';
import { RecentLatencyChart } from '../features/checks/components/RecentLatencyChart';
import { useMonitorChecks } from '../features/checks/hooks/use-checks';
import type { MonitorMetrics } from '../features/metrics/api/metric-contracts';
import { OperationalError, OperationalSkeleton } from '../features/metrics/components/OperationalStates';
import { TimeRangeControl } from '../features/metrics/components/TimeRangeControl';
import { useMonitorMetrics } from '../features/metrics/hooks/use-monitor-metrics';
import { useMonitorTimeRange } from '../features/metrics/hooks/use-monitor-time-range';
import { formatCount, formatLatency, formatPercentage, regionLabel } from '../features/metrics/metric-formatters';
import { MonitorStatus } from '../features/monitors/components/MonitorStatus';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { useMonitorWorkspace } from '../features/monitors/monitor-workspace-context';
import { formatDuration, formatExactDate, formatRelativeDate } from '../lib/dates';

export function MonitorOverviewPage() {
  const monitor = useMonitorWorkspace();
  const { preset, range, setPreset } = useMonitorTimeRange();
  const metricsQuery = useMonitorMetrics(monitor.id, range);
  const checksQuery = useMonitorChecks(monitor.id, { range, page: 1, limit: 50 });

  return (
    <div className="monitor-workspace__content">
      <div className="operational-toolbar">
        <div><h2>Operational overview</h2><p>Aggregate evidence for the selected observation window.</p></div>
        <TimeRangeControl value={preset} onChange={setPreset} />
      </div>

      {metricsQuery.isPending ? (
        <OperationalSkeleton label="Loading monitor metrics" rows={6} />
      ) : metricsQuery.isError ? (
        <OperationalError message={monitorErrorMessage(metricsQuery.error)} onRetry={() => void metricsQuery.refetch()} />
      ) : (
        <MetricsContent metrics={metricsQuery.data} monitorId={monitor.id} />
      )}

      <section className="operational-section">
        {checksQuery.isPending ? (
          <OperationalSkeleton label="Loading recent checks" rows={4} />
        ) : checksQuery.isError ? (
          <OperationalError message={monitorErrorMessage(checksQuery.error)} onRetry={() => void checksQuery.refetch()} />
        ) : (
          <>
            <RecentLatencyChart checks={checksQuery.data.checks} />
            <div className="operational-section__heading">
              <div><h2>Recent checks</h2><p>Latest completed regional probes in this range.</p></div>
              <Link to={`checks?range=${preset}`}>View all checks <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            {checksQuery.data.checks.length === 0 ? (
              <div className="operational-empty"><strong>No checks in this range</strong><span>Try a wider time range to review earlier evidence.</span></div>
            ) : <CheckTable checks={checksQuery.data.checks.slice(0, 8)} compact />}
          </>
        )}
      </section>
    </div>
  );
}

function MetricsContent({ metrics, monitorId }: { metrics: MonitorMetrics; monitorId: string }) {
  const hasNoChecks = metrics.totals.checks === 0;

  return (
    <>
      {hasNoChecks ? (
        <div className="evidence-notice" role="status">
          <strong>{metrics.monitor.status === 'pending' ? 'Waiting for first regional checks.' : 'No evidence in this range.'}</strong>
          <span>Sentinel reports metrics only after completed probes; no data is never shown as zero.</span>
        </div>
      ) : null}

      <section className="metric-grid" aria-label="Monitor metrics">
        <article><span>Uptime</span><strong>{formatPercentage(metrics.uptimePercentage)}</strong><small>{metrics.uptimePercentage === null ? 'No data yet' : `${formatCount(metrics.totals.successfulChecks)} successful checks`}</small></article>
        <article><span>Average latency</span><strong>{formatLatency(metrics.latency.averageMs)}</strong><small>{formatCount(metrics.latency.sampleCount)} measured samples</small></article>
        <article><span>Checks</span><strong>{formatCount(metrics.totals.checks)}</strong><small>All configured regions</small></article>
        <article><span>Failures</span><strong>{formatCount(metrics.totals.failedChecks)}</strong><small>Within selected range</small></article>
        <article><span>Current state</span><MonitorStatus status={metrics.monitor.status} /><small>Backend aggregate state</small></article>
      </section>

      <section className="latency-statistics operational-section">
        <div className="operational-section__heading"><div><h2>Latency distribution</h2><p>Exact aggregate statistics from measured check results.</p></div></div>
        <div className="percentile-grid">
          <div><span>Average</span><strong>{formatLatency(metrics.latency.averageMs)}</strong></div>
          <div><span>P50</span><strong>{formatLatency(metrics.latency.p50Ms)}</strong></div>
          <div><span>P95</span><strong>{formatLatency(metrics.latency.p95Ms)}</strong></div>
          <div><span>P99</span><strong>{formatLatency(metrics.latency.p99Ms)}</strong></div>
        </div>
      </section>

      <section className="operational-section">
        <div className="operational-section__heading"><div><h2>Regional evidence</h2><p>Latest result and aggregate performance by configured probe region.</p></div></div>
        <div className="region-metric-grid">
          {metrics.regions.map((region) => (
            <article key={region.region}>
              <header><div><span>{regionLabel(region.region)}</span><code>{region.region}</code></div>{region.latestCheck ? <span className={`evidence-state evidence-state--${region.latestCheck.success ? 'success' : 'failed'}`}>{region.latestCheck.success ? 'Latest succeeded' : 'Latest failed'}</span> : <span className="evidence-state">No evidence</span>}</header>
              <dl>
                <div><dt>Uptime</dt><dd>{formatPercentage(region.uptimePercentage)}</dd></div>
                <div><dt>Avg latency</dt><dd>{formatLatency(region.averageLatencyMs)}</dd></div>
                <div><dt>Checks</dt><dd>{formatCount(region.totalChecks)}</dd></div>
                <div><dt>Failures</dt><dd>{formatCount(region.failedChecks)}</dd></div>
              </dl>
              <footer>{region.latestCheck ? <><span>Last check</span><time dateTime={region.latestCheck.scheduledAt} title={formatExactDate(region.latestCheck.scheduledAt)}>{formatRelativeDate(region.latestCheck.scheduledAt)}</time></> : <span>No checks in this range</span>}</footer>
            </article>
          ))}
        </div>
      </section>

      <section className="operational-section">
        <div className="operational-section__heading">
          <div><h2>Recent incidents</h2><p>Newest system-derived incidents for this monitor.</p></div>
          <Link to={`/app/monitors/${monitorId}/incidents`}>View all incidents <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {metrics.recentIncidents.length === 0 ? (
          <div className="operational-empty"><strong>No incidents recorded</strong><span>No outage consensus has been recorded for this monitor.</span></div>
        ) : (
          <div className="recent-incident-list">
            {metrics.recentIncidents.map((incident) => (
              <Link key={incident.id} to={`/app/incidents/${incident.id}`}>
                <span className={`incident-status incident-status--${incident.status}`}>{incident.status === 'open' ? 'Open' : 'Resolved'}</span>
                <div><strong>{incident.triggerReason}</strong><small>Opened {formatRelativeDate(incident.openedAt)}</small></div>
                <span>{formatDuration(incident.openedAt, incident.resolvedAt)}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
