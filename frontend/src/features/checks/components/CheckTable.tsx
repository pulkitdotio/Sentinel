import type { CheckResult } from '../api/check-contracts';
import { checkErrorLabel } from '../check-formatters';
import { formatExactDateWithSeconds } from '../../../lib/dates';
import { formatLatency, regionLabel } from '../../metrics/metric-formatters';

export function CheckResultBadge({ success }: { success: boolean }) {
  return (
    <span className={`result-badge result-badge--${success ? 'success' : 'failed'}`}>
      <span aria-hidden="true" />{success ? 'Success' : 'Failed'}
    </span>
  );
}

export function CheckTable({ checks, compact = false }: { checks: CheckResult[]; compact?: boolean }) {
  return (
    <div className={`check-table-wrap${compact ? ' check-table-wrap--compact' : ''}`}>
      <table className="check-table">
        <caption className="sr-only">Regional check history</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Region</th>
            <th scope="col">Result</th>
            <th scope="col">HTTP status</th>
            <th scope="col">Latency</th>
            {!compact ? <th scope="col">Error</th> : null}
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr key={check.id}>
              <td data-label="Time"><time dateTime={check.scheduledAt}>{formatExactDateWithSeconds(check.scheduledAt)}</time></td>
              <td data-label="Region"><code>{regionLabel(check.region)}</code></td>
              <td data-label="Result"><CheckResultBadge success={check.success} /></td>
              <td data-label="HTTP status"><code>{check.statusCode ?? '—'}</code></td>
              <td data-label="Latency"><code>{formatLatency(check.latencyMs)}</code></td>
              {!compact ? <td data-label="Error"><span title={check.errorMetadata?.code}>{checkErrorLabel(check.errorType)}</span></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
