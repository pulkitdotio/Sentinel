import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatExactDate, formatRelativeDate } from '../../../lib/dates';
import type { Monitor } from '../api/monitor-contracts';
import { MonitorStatus } from './MonitorStatus';

export function MonitorList({ monitors, limit }: { monitors: Monitor[]; limit?: number }) {
  const visibleMonitors = limit === undefined ? monitors : monitors.slice(0, limit);

  return (
    <div className="monitor-table" aria-label="Monitors">
      <div className="monitor-table__head" aria-hidden="true">
        <span>Name</span>
        <span>Status</span>
        <span>Method</span>
        <span>Regions</span>
        <span>Interval</span>
        <span>Last checked</span>
        <span aria-hidden="true" />
      </div>
      {visibleMonitors.map((monitor) => (
        <Link
          className="monitor-table__row"
          to={`/app/monitors/${monitor.id}`}
          key={monitor.id}
          aria-label={`Open ${monitor.name}`}
        >
          <span className="monitor-table__identity">
            <strong>{monitor.name}</strong>
            <span title={monitor.url}>{monitor.url}</span>
          </span>
          <span data-label="Status"><MonitorStatus status={monitor.status} /></span>
          <code data-label="Method">{monitor.method}</code>
          <span data-label="Regions">{monitor.regions.length}</span>
          <code data-label="Interval">{monitor.intervalSeconds}s</code>
          <time
            data-label="Last checked"
            dateTime={monitor.lastCheckedAt ?? undefined}
            title={monitor.lastCheckedAt ? formatExactDate(monitor.lastCheckedAt) : undefined}
          >
            {formatRelativeDate(monitor.lastCheckedAt)}
          </time>
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      ))}
      {limit !== undefined && monitors.length > limit ? (
        <Link className="monitor-table__footer" to="/app/monitors">
          View all {monitors.length} monitors <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
