import { Activity, Clock3, Globe2, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { m, useInView } from 'motion/react';
import { useRef } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { latencyPoints, regionalChecks } from '../../lib/presentational-data';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { StatusDot } from '../ui/StatusDot';
import { Reveal } from './MarketingMotion';
import { sentinelEase } from './motion-config';

function LatencyChart({ revealed, reduced }: { revealed: boolean; reduced: boolean }) {
  const points = latencyPoints
    .map((value, index) => `${(index / (latencyPoints.length - 1)) * 600},${170 - value * 1.7}`)
    .join(' ');

  return (
    <svg className="marketing-latency-chart" viewBox="0 0 600 180" role="img" aria-label="Stable latency trend over the last 24 hours">
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
      <m.polygon
        points={`0,180 ${points} 600,180`}
        fill="url(#area-fade)"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: revealed ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.65, delay: 0.48 }}
      />
      <m.polyline
        points={points}
        fill="none"
        stroke="url(#line-fade)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: revealed ? 1 : 0, opacity: revealed ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 1.05, delay: 0.42, ease: sentinelEase }}
      />
      <m.circle
        cx="600"
        cy={170 - (latencyPoints.at(-1) ?? 0) * 1.7}
        r="4"
        fill="#a7efc0"
        initial={reduced ? false : { opacity: 0, scale: 0 }}
        animate={{ opacity: revealed ? 1 : 0, scale: revealed ? 1 : 0 }}
        transition={{ duration: 0.35, delay: 1.1 }}
      />
    </svg>
  );
}

export function ProductShowcase() {
  const panelRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(panelRef, { once: true, amount: 0.16 });
  const prefersReducedMotion = usePrefersReducedMotion();
  const revealed = prefersReducedMotion || isInView;

  return (
    <Section id="product" className="product" eyebrow="02 / Product signal">
      <Container>
        <Reveal className="section-heading section-heading--center" distance={26}>
          <h2>Reliability, without the fog.</h2>
          <p>A focused view of current health, historical latency, and the regional evidence underneath.</p>
        </Reveal>
        <m.div
          ref={panelRef}
          className="surface dashboard-preview"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 34, rotateX: 2.5, scale: 0.985 }}
          animate={revealed ? { opacity: 1, y: 0, rotateX: 0, scale: 1 } : undefined}
          transition={{ duration: prefersReducedMotion ? 0 : 0.78, ease: sentinelEase }}
        >
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
                {[
                  { label: 'Uptime · 30d', value: '99.98', unit: '%', detail: '+0.04%' },
                  { label: 'Average latency', value: '181', unit: 'ms', detail: '−12ms' },
                  { label: 'Checks', value: '12,847', unit: '', detail: '3 regions' },
                ].map((metric, index) => (
                  <m.div
                    key={metric.label}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={revealed ? { opacity: 1, y: 0 } : undefined}
                    transition={{ duration: 0.45, delay: 0.22 + index * 0.08, ease: sentinelEase }}
                  >
                    <span>{metric.label}</span><strong>{metric.value}{metric.unit ? <small>{metric.unit}</small> : null}</strong><em>{metric.detail}</em>
                  </m.div>
                ))}
              </div>
              <div className="chart-panel">
                <div className="chart-panel__header"><span>Latency · 24 hours</span><div><b>P50 <i>148ms</i></b><b>P95 <i>284ms</i></b><b>P99 <i>412ms</i></b></div></div>
                <LatencyChart revealed={revealed} reduced={prefersReducedMotion} />
                <div className="chart-panel__axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span></div>
              </div>
              <div className="region-table">
                <div className="region-table__head"><span>Regional checks</span><span>Status</span><span>Latency</span><span>HTTP</span></div>
                {regionalChecks.map((region, index) => (
                  <m.div
                    className="region-table__row"
                    key={region.code}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
                    animate={revealed ? { opacity: 1, x: 0 } : undefined}
                    transition={{ duration: 0.42, delay: 0.68 + index * 0.07, ease: sentinelEase }}
                  >
                    <span><b>{region.code}</b>{region.city}</span><StatusDot label="Healthy" /><code>{region.latency}</code><code>200 OK</code>
                  </m.div>
                ))}
              </div>
            </div>
          </div>
          <p className="preview-caption">Static product preview · Presentational data only</p>
        </m.div>
      </Container>
    </Section>
  );
}
