import { ArrowRight, CheckCircle2, Cpu, Radio, Server, Zap } from 'lucide-react';

import { incidentSteps } from '../../lib/presentational-data';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { StatusDot } from '../ui/StatusDot';
import { Surface } from '../ui/Surface';

export function IncidentRealtime() {
  return (
    <Section id="architecture" className="incident" eyebrow="03 / Deterministic by design">
      <Container>
        <div className="incident__grid">
          <div className="incident__copy">
            <h2>Incidents open on evidence, not intuition.</h2>
            <p>
              Sentinel waits for configured failure thresholds and regional consensus.
              Recovery follows the same explicit rules. AI never votes.
            </p>
            <div className="principle-list">
              <span><CheckCircle2 size={16} aria-hidden="true" /> Transient failures stay transient</span>
              <span><CheckCircle2 size={16} aria-hidden="true" /> One open incident per monitor</span>
              <span><CheckCircle2 size={16} aria-hidden="true" /> Every transition is preserved</span>
            </div>
          </div>
          <Surface className="incident-timeline">
            <div className="incident-timeline__header"><span>Incident evaluation</span><StatusDot label="Resolved" /></div>
            {incidentSteps.map((step, index) => (
              <div className="timeline-step" key={step.label}>
                <div className="timeline-step__rail"><span>{index + 1}</span>{index < incidentSteps.length - 1 ? <i /> : null}</div>
                <div><strong>{step.label}</strong><small>{step.detail}</small></div>
                <code>{`10:${42 + index * 3}`}</code>
              </div>
            ))}
          </Surface>
        </div>

        <div className="realtime" id="realtime">
          <div className="section-heading section-heading--center">
            <p className="eyebrow">04 / Realtime delivery</p>
            <h2>Durable first. Live a heartbeat later.</h2>
            <p>Workers publish small domain events only after monitoring evidence is safely persisted.</p>
          </div>
          <Surface className="realtime-pipeline">
            <div className="pipeline-node"><span><Cpu size={20} aria-hidden="true" /></span><strong>Worker</strong><small>Check persisted</small></div>
            <ArrowRight className="pipeline-arrow" size={18} aria-hidden="true" />
            <div className="pipeline-node"><span><Server size={20} aria-hidden="true" /></span><strong>Redis Pub/Sub</strong><small>Domain event</small></div>
            <ArrowRight className="pipeline-arrow" size={18} aria-hidden="true" />
            <div className="pipeline-node"><span><Radio size={20} aria-hidden="true" /></span><strong>Socket.IO</strong><small>User-scoped room</small></div>
            <ArrowRight className="pipeline-arrow" size={18} aria-hidden="true" />
            <div className="pipeline-node pipeline-node--active"><span><Zap size={20} aria-hidden="true" /></span><strong>Live dashboard</strong><small>Event received</small></div>
          </Surface>
          <p className="realtime__note">Realtime preview only · No Socket.IO client is connected in Phase 0</p>
        </div>
      </Container>
    </Section>
  );
}
