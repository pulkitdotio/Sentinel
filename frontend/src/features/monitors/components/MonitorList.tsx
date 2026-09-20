import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatExactDate, formatRelativeDate } from '../../../lib/dates';
import type { Monitor } from '../api/monitor-contracts';
import { MonitorStatus } from './MonitorStatus';

export function MonitorList({ monitors, limit }: { monitors: Monitor[]; limit?: number }) {
  const visibleMonitors = limit === undefined ? monitors : monitors.slice(0, limit);

  return (
    <div className="monitor-table" role="table" aria-label="Monitors">
      <div className="monitor-table__head" role="row">
        <span role="columnheader">Name</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Method</span>
        <span role="columnheader">Regions</span>
        <span role="columnheader">Interval</span>
        <span role="columnheader">Last checked</span>
        <span aria-hidden="true" />
      </div>
      {visibleMonitors.map((monitor) => (
        <Link
          className="monitor-table__row"
          to={`/app/monitors/${monitor.id}`}
          role="row"
          key={monitor.id}
          aria-label={`Open ${monitor.name}`}
        >
          <span className="monitor-table__identity" role="cell">
            <strong>{monitor.name}</strong>
            <span title={monitor.url}>{monitor.url}</span>
          </span>
          <span role="cell" data-label="Status"><MonitorStatus status={monitor.status} /></span>
          <code role="cell" data-label="Method">{monitor.method}</code>
          <span role="cell" data-label="Regions">{monitor.regions.length}</span>
          <code role="cell" data-label="Interval">{monitor.intervalSeconds}s</code>
          <time
            role="cell"
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
