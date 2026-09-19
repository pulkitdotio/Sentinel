import { ArrowDown, Check, MapPin } from 'lucide-react';

import { regionalChecks } from '../../lib/presentational-data';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { StatusDot } from '../ui/StatusDot';
import { Surface } from '../ui/Surface';

export function DistributedMonitoring() {
  return (
    <Section id="monitoring" className="distributed" eyebrow="01 / Distributed monitoring">
      <Container>
        <div className="section-heading section-heading--split">
          <h2>One endpoint. Three independent points of view.</h2>
          <p>
            Sentinel schedules the same check across separately running regional probes,
            preserving where every result came from.
          </p>
        </div>
        <div className="distributed__grid">
          <Surface className="probe-map">
            <div className="probe-map__grid" aria-hidden="true" />
            <div className="probe-map__endpoint">
              <span className="probe-map__orb"><Check size={18} aria-hidden="true" /></span>
              <strong>api.example.com</strong>
              <small>Monitored endpoint</small>
            </div>
            {regionalChecks.map((region, index) => (
              <div className={`probe-card probe-card--${index + 1}`} key={region.code}>
                <MapPin size={14} aria-hidden="true" />
                <span><strong>{region.city}</strong><small>{region.code.toUpperCase()} probe</small></span>
                <StatusDot label={region.latency} status={region.status} />
              </div>
            ))}
          </Surface>
          <div className="distributed__details">
            <div className="detail-step"><span>01</span><div><strong>Scheduler finds due monitors</strong><p>One stable job is created for each configured region.</p></div></div>
            <ArrowDown size={15} className="detail-step__arrow" aria-hidden="true" />
            <div className="detail-step"><span>02</span><div><strong>Probes check independently</strong><p>Latency, status, timing, and safe failure detail are persisted.</p></div></div>
            <ArrowDown size={15} className="detail-step__arrow" aria-hidden="true" />
            <div className="detail-step"><span>03</span><div><strong>Consensus becomes state</strong><p>Regional evidence—not a single request—drives monitor health.</p></div></div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
