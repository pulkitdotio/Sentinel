import type { CheckResult } from '../api/check-contracts';
import { formatLatency } from '../../metrics/metric-formatters';

interface ChartPoint {
  check: CheckResult;
  x: number;
  y: number;
}

export function RecentLatencyChart({ checks }: { checks: CheckResult[] }) {
  const samples = checks.filter((check) => check.latencyMs !== null).slice().reverse();

  if (samples.length === 0) {
    return (
      <div className="latency-chart-empty">
        <strong>No latency samples yet</strong>
        <span>Completed checks with measured latency will appear here.</span>
      </div>
    );
  }

  const latencies = samples.map((sample) => sample.latencyMs as number);
  const maximum = Math.max(...latencies, 1);
  const minimum = Math.min(...latencies);
  const width = 720;
  const height = 190;
  const paddingX = 18;
  const paddingY = 20;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2;
  const points: ChartPoint[] = samples.map((check, index) => ({
    check,
    x: paddingX + (samples.length === 1 ? plotWidth / 2 : (index / (samples.length - 1)) * plotWidth),
    y: paddingY + (1 - ((check.latencyMs as number) / maximum)) * plotHeight,
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');

  return (
    <figure className="latency-chart">
      <figcaption>
        <div><h2>Recent latency samples</h2><p>Up to 50 latest checks in this range; this is not an exhaustive time series.</p></div>
        <div><span>Low <strong>{formatLatency(minimum)}</strong></span><span>High <strong>{formatLatency(maximum)}</strong></span></div>
      </figcaption>
      <svg viewBox={`0 0 ${String(width)} ${String(height)}`} role="img" aria-label={`Recent measured latency from ${formatLatency(minimum)} to ${formatLatency(maximum)}`}>
        <title>Recent measured latency samples</title>
        {[0, 0.5, 1].map((fraction) => (
          <line key={fraction} x1={paddingX} x2={width - paddingX} y1={paddingY + plotHeight * fraction} y2={paddingY + plotHeight * fraction} className="latency-chart__grid" />
        ))}
        {points.length > 1 ? <path d={path} className="latency-chart__line" /> : null}
        {points.map((point) => (
          <circle
            key={point.check.id}
            cx={point.x}
            cy={point.y}
            r={point.check.success ? 2.5 : 4}
            className={point.check.success ? 'latency-chart__point' : 'latency-chart__point latency-chart__point--failed'}
          >
            <title>{`${point.check.region}: ${formatLatency(point.check.latencyMs)} · ${point.check.success ? 'success' : 'failed'}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}
