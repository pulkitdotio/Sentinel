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

const desktopConnections = [
  'M 29 23 C 37 28, 42 38, 48 46',
  'M 74 22 C 66 28, 60 37, 56 46',
  'M 68 76 C 62 70, 58 62, 55 55',
];

const mobileConnections = [
  'M 48 17 C 48 31, 49 43, 50 50',
  'M 58 34 C 55 42, 53 48, 51 52',
  'M 58 80 C 55 71, 52 64, 51 60',
];

function ConnectorGroup({ mobile, revealed }: { mobile?: boolean; revealed: boolean }) {
  const paths = mobile ? mobileConnections : desktopConnections;
  return (
    <g className={mobile ? 'probe-map__connections--mobile' : 'probe-map__connections--desktop'}>
      {paths.map((path, index) => (
        <m.path
          d={path}
          key={path}
          initial={false}
          animate={{ pathLength: revealed ? 1 : 0 }}
          transition={{ duration: 0.65, delay: 0.42 + index * 0.08, ease: sentinelEase }}
        />
      ))}
    </g>
  );
}

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
            <svg className="probe-map__connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <ConnectorGroup revealed={revealed} />
              <ConnectorGroup mobile revealed={revealed} />
            </svg>
            <m.div
              className="probe-map__endpoint"
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.82 }}
              animate={revealed ? { opacity: 1, scale: 1 } : undefined}
              transition={{ duration: 0.55, delay: 0.12, ease: sentinelEase }}
            >
              <span className="probe-map__orb"><Check size={18} aria-hidden="true" /></span>
              <strong>api.example.com</strong>
              <small>Monitored endpoint</small>
            </m.div>
            {regionalChecks.map((region, index) => (
              <m.div
                className={`probe-card probe-card--${index + 1}`}
                key={region.code}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
                animate={revealed ? { opacity: 1, y: 0, scale: 1 } : undefined}
                transition={{ duration: 0.5, delay: 0.22 + index * 0.08, ease: sentinelEase }}
              >
                <MapPin size={14} aria-hidden="true" />
                <span><strong>{region.city}</strong><small>{region.code.toUpperCase()} probe</small></span>
                <StatusDot label={region.latency} status={region.status} />
              </m.div>
            ))}
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
