import { useState } from 'react';

import type { CheckResult } from '../api/check-contracts';
import { formatLatency, regionLabel } from '../../metrics/metric-formatters';

interface ChartPoint {
  check: CheckResult;
  x: number;
  y: number;
}

export function RecentLatencyChart({ checks }: { checks: CheckResult[] }) {
  const [activePointId, setActivePointId] = useState<string | null>(null);
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
  const activePoint = points.find((point) => point.check.id === activePointId);
  const pointLabel = (point: ChartPoint) => `${regionLabel(point.check.region)}: ${formatLatency(point.check.latencyMs)} · ${point.check.success ? 'success' : 'failed'}`;

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
        {points.length > 1 ? (
          <path
            d={path}
            pathLength="1"
            className="latency-chart__line latency-chart__line--enter"
          />
        ) : null}
        {points.map((point) => (
          <circle
            key={point.check.id}
            cx={point.x}
            cy={point.y}
            r={point.check.success ? 2.5 : 4}
            className={point.check.success ? 'latency-chart__point latency-chart__point--enter' : 'latency-chart__point latency-chart__point--failed latency-chart__point--enter'}
            tabIndex={0}
            role="img"
            aria-label={pointLabel(point)}
            onMouseEnter={() => setActivePointId(point.check.id)}
            onMouseLeave={() => setActivePointId(null)}
            onFocus={() => setActivePointId(point.check.id)}
            onBlur={() => setActivePointId(null)}
          >
            <title>{`${point.check.region}: ${formatLatency(point.check.latencyMs)} · ${point.check.success ? 'success' : 'failed'}`}</title>
          </circle>
        ))}
        {activePoint ? (
          <g
            className="latency-chart__tooltip"
            aria-hidden="true"
            transform={`translate(${String(Math.min(Math.max(activePoint.x - 68, 8), width - 144))} ${String(Math.max(activePoint.y - 38, 5))})`}
          >
            <rect width="136" height="28" rx="6" />
            <text x="68" y="18" textAnchor="middle">{`${regionLabel(activePoint.check.region)} · ${formatLatency(activePoint.check.latencyMs)}`}</text>
          </g>
        ) : null}
      </svg>
    </figure>
  );
}
