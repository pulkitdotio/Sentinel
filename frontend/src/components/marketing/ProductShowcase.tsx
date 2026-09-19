import { Activity, Clock3, Globe2, MoreHorizontal, ShieldCheck } from 'lucide-react';

import { latencyPoints, regionalChecks } from '../../lib/presentational-data';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { StatusDot } from '../ui/StatusDot';
import { Surface } from '../ui/Surface';

function LatencyChart() {
  const points = latencyPoints
    .map((value, index) => `${(index / (latencyPoints.length - 1)) * 600},${170 - value * 1.7}`)
    .join(' ');

  return (
    <svg className="latency-chart" viewBox="0 0 600 180" role="img" aria-label="Stable latency trend over the last 24 hours">
      <defs>
        <linearGradient id="line-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#87958f" />
          <stop offset="1" stopColor="#a7efc0" />
        </linearGradient>
        <linearGradient id="area-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#72d994" stopOpacity=".18" />
          <stop offset="1" stopColor="#72d994" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="latency-chart__grid"><line x1="0" y1="45" x2="600" y2="45" /><line x1="0" y1="95" x2="600" y2="95" /><line x1="0" y1="145" x2="600" y2="145" /></g>
      <polygon points={`0,180 ${points} 600,180`} fill="url(#area-fade)" />
      <polyline points={points} fill="none" stroke="url(#line-fade)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx="600" cy={170 - (latencyPoints.at(-1) ?? 0) * 1.7} r="4" fill="#a7efc0" />
    </svg>
  );
}

export function ProductShowcase() {
  return (
    <Section id="product" className="product" eyebrow="02 / Product signal">
      <Container>
        <div className="section-heading section-heading--center">
          <h2>Reliability, without the fog.</h2>
          <p>A focused view of current health, historical latency, and the regional evidence underneath.</p>
        </div>
        <Surface className="dashboard-preview">
          <div className="dashboard-preview__topbar">
            <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
            <span>Monitor detail</span>
            <MoreHorizontal size={17} aria-hidden="true" />
          </div>
          <div className="dashboard-preview__body">
            <aside className="preview-sidebar" aria-label="Preview navigation">
              <div className="preview-sidebar__mark"><ShieldCheck size={18} aria-hidden="true" /></div>
              <span className="is-active"><Activity size={16} aria-hidden="true" /></span>
              <span><Globe2 size={16} aria-hidden="true" /></span>
              <span><Clock3 size={16} aria-hidden="true" /></span>
            </aside>
            <div className="preview-main">
              <div className="monitor-title">
                <div><small>Production API</small><h3>api.example.com</h3></div>
                <StatusDot label="Healthy" />
              </div>
              <div className="metrics-row">
                <div><span>Uptime · 30d</span><strong>99.98<small>%</small></strong><em>+0.04%</em></div>
                <div><span>Average latency</span><strong>181<small>ms</small></strong><em>−12ms</em></div>
                <div><span>Checks</span><strong>12,847</strong><em>3 regions</em></div>
              </div>
              <div className="chart-panel">
                <div className="chart-panel__header"><span>Latency · 24 hours</span><div><b>P50 <i>148ms</i></b><b>P95 <i>284ms</i></b><b>P99 <i>412ms</i></b></div></div>
                <LatencyChart />
                <div className="chart-panel__axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span></div>
              </div>
              <div className="region-table">
                <div className="region-table__head"><span>Regional checks</span><span>Status</span><span>Latency</span><span>HTTP</span></div>
                {regionalChecks.map((region) => (
                  <div className="region-table__row" key={region.code}>
                    <span><b>{region.code}</b>{region.city}</span><StatusDot label="Healthy" /><code>{region.latency}</code><code>200 OK</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="preview-caption">Static product preview · Presentational data only</p>
        </Surface>
      </Container>
    </Section>
  );
}
