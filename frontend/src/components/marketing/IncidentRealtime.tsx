import { ArrowRight, CheckCircle2, Cpu, Radio, Server, Zap } from 'lucide-react';
import { m, useInView } from 'motion/react';
import { useRef } from 'react';

import { useElementVisibility } from '../../hooks/useElementVisibility';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../lib/cn';
import { incidentSteps } from '../../lib/presentational-data';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { StatusDot } from '../ui/StatusDot';
import { Reveal } from './MarketingMotion';
import { sentinelEase } from './motion-config';

const pipelineNodes = [
  { icon: Cpu, label: 'Worker', detail: 'Check persisted' },
  { icon: Server, label: 'Redis Pub/Sub', detail: 'Domain event' },
  { icon: Radio, label: 'Socket.IO', detail: 'User-scoped room' },
  { icon: Zap, label: 'Live dashboard', detail: 'Event received', active: true },
];

export function IncidentRealtime() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineInView = useInView(timelineRef, { once: true, amount: 0.25 });
  const { ref: pipelineRef, isVisible: pipelineVisible } = useElementVisibility<HTMLDivElement>();
  const pipelineInView = useInView(pipelineRef, { once: true, amount: 0.3 });
  const prefersReducedMotion = usePrefersReducedMotion();
  const timelineRevealed = prefersReducedMotion || timelineInView;
  const pipelineRevealed = prefersReducedMotion || pipelineInView;
  const pipelineActive = pipelineVisible && !prefersReducedMotion;

  return (
    <Section id="architecture" className="incident" eyebrow="03 / Deterministic by design">
      <Container>
        <div className="incident__grid">
          <Reveal className="incident__copy" distance={26}>
            <h2>Incidents open on evidence, not intuition.</h2>
            <p>
              Sentinel waits for configured failure thresholds and regional consensus.
              Recovery follows the same explicit rules. AI never votes.
            </p>
            <div className="principle-list">
              {[
                'Transient failures stay transient',
                'One open incident per monitor',
                'Every transition is preserved',
              ].map((principle, index) => (
                <m.span
                  key={principle}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.42, delay: 0.18 + index * 0.07, ease: sentinelEase }}
                >
                  <CheckCircle2 size={16} aria-hidden="true" /> {principle}
                </m.span>
              ))}
            </div>
          </Reveal>
          <m.div
            ref={timelineRef}
            className="surface incident-timeline"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
            animate={timelineRevealed ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{ duration: prefersReducedMotion ? 0 : 0.68, ease: sentinelEase }}
          >
            <div className="incident-timeline__header"><span>Incident evaluation</span><StatusDot label="Resolved" /></div>
            {incidentSteps.map((step, index) => (
              <m.div
                className="timeline-step"
                key={step.label}
                initial={prefersReducedMotion ? false : { opacity: 0, x: 14 }}
                animate={timelineRevealed ? { opacity: 1, x: 0 } : undefined}
                transition={{ duration: 0.44, delay: 0.2 + index * 0.11, ease: sentinelEase }}
              >
                <div className="timeline-step__rail">
                  <span>{index + 1}</span>
                  {index < incidentSteps.length - 1 ? (
                    <m.i
                      initial={prefersReducedMotion ? false : { scaleY: 0 }}
                      animate={timelineRevealed ? { scaleY: 1 } : undefined}
                      transition={{ duration: 0.32, delay: 0.36 + index * 0.11, ease: sentinelEase }}
                    />
                  ) : null}
                </div>
                <div><strong>{step.label}</strong><small>{step.detail}</small></div>
                <code>{`10:${42 + index * 3}`}</code>
              </m.div>
            ))}
          </m.div>
        </div>

        <div className="realtime" id="realtime">
          <Reveal className="section-heading section-heading--center" distance={26}>
            <p className="eyebrow">04 / Realtime delivery</p>
            <h2>Durable first. Live a heartbeat later.</h2>
            <p>Workers publish small domain events only after monitoring evidence is safely persisted.</p>
          </Reveal>
          <m.div
            ref={pipelineRef}
            className="surface realtime-pipeline"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
            animate={pipelineRevealed ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: prefersReducedMotion ? 0 : 0.62, ease: sentinelEase }}
          >
            <span className={cn('realtime-pipeline__track', pipelineActive && 'is-active')} aria-hidden="true"><i /></span>
            {pipelineNodes.map(({ icon: Icon, label, detail, active }, index) => (
              <div className="pipeline-fragment" key={label}>
                <m.div
                  className={cn('pipeline-node', active && 'pipeline-node--active')}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={pipelineRevealed ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.42, delay: 0.16 + index * 0.09, ease: sentinelEase }}
                >
                  <span><Icon size={20} aria-hidden="true" /></span><strong>{label}</strong><small>{detail}</small>
                </m.div>
                {index < pipelineNodes.length - 1 ? <ArrowRight className="pipeline-arrow" size={18} aria-hidden="true" /> : null}
              </div>
            ))}
          </m.div>
          <p className="realtime__note">Live event path · Authenticated Socket.IO delivery</p>
        </div>
      </Container>
    </Section>
  );
}
