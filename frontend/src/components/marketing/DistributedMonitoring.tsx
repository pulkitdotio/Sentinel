import { ArrowDown, Check, MapPin } from 'lucide-react';
import { m, useInView } from 'motion/react';
import { useRef } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { regionalChecks } from '../../lib/presentational-data';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { StatusDot } from '../ui/StatusDot';
import { Reveal } from './MarketingMotion';
import { sentinelEase } from './motion-config';

export function DistributedMonitoring() {
  const mapRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(mapRef, { once: true, amount: 0.28 });
  const prefersReducedMotion = usePrefersReducedMotion();
  const revealed = prefersReducedMotion || isInView;

  return (
    <Section id="monitoring" className="distributed" eyebrow="01 / Distributed monitoring">
      <Container>
        <Reveal className="section-heading section-heading--split" distance={28}>
          <h2>One endpoint. Three independent points of view.</h2>
          <p>
            Sentinel schedules the same check across separately running regional probes,
            preserving where every result came from.
          </p>
        </Reveal>
        <div className="distributed__grid">
          <m.div
            ref={mapRef}
            className="surface probe-map"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
            animate={revealed ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{ duration: prefersReducedMotion ? 0 : 0.7, ease: sentinelEase }}
          >
            <div className="probe-map__grid" aria-hidden="true" />
            <m.div
              className="probe-map__endpoint"
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.82 }}
              animate={revealed ? { opacity: 1, scale: 1 } : undefined}
              transition={{ duration: 0.55, delay: 0.12, ease: sentinelEase }}
            >
              <span className="probe-map__orb"><Check size={18} aria-hidden="true" /></span>
              <div>
                <strong>api.example.com</strong>
                <small>Monitored endpoint</small>
              </div>
              <StatusDot label="Healthy" />
            </m.div>
            <div className="probe-map__regions">
              {regionalChecks.map((region, index) => (
                <m.div
                  className="probe-card"
                  key={region.code}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
                  animate={revealed ? { opacity: 1, y: 0, scale: 1 } : undefined}
                  transition={{ duration: 0.5, delay: 0.22 + index * 0.08, ease: sentinelEase }}
                >
                  <div className="probe-card__header">
                    <MapPin size={14} aria-hidden="true" />
                    <div><strong>{region.city}</strong><small>{region.code.toUpperCase()} probe</small></div>
                  </div>
                  <code>{region.latency}</code>
                  <StatusDot label="Healthy" status={region.status} />
                </m.div>
              ))}
            </div>
            <div className="probe-map__summary"><StatusDot label="Three regions reporting" /></div>
          </m.div>
          <Reveal className="distributed__details" delay={0.12} distance={20}>
            <div className="detail-step"><span>01</span><div><strong>Scheduler finds due monitors</strong><p>One stable job is created for each configured region.</p></div></div>
            <ArrowDown size={15} className="detail-step__arrow" aria-hidden="true" />
            <div className="detail-step"><span>02</span><div><strong>Probes check independently</strong><p>Latency, status, timing, and safe failure detail are persisted.</p></div></div>
            <ArrowDown size={15} className="detail-step__arrow" aria-hidden="true" />
            <div className="detail-step"><span>03</span><div><strong>Consensus becomes state</strong><p>Regional evidence—not a single request—drives monitor health.</p></div></div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
