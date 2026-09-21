import { Activity, Database, RadioTower, Workflow } from 'lucide-react';
import { m } from 'motion/react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { Container } from '../ui/Container';
import { sentinelEase } from './motion-config';

const signals = [
  { icon: RadioTower, label: 'Regional probes', detail: 'Independent checks' },
  { icon: Database, label: 'Durable evidence', detail: 'MongoDB history' },
  { icon: Workflow, label: 'Deterministic state', detail: 'Threshold consensus' },
  { icon: Activity, label: 'Realtime events', detail: 'Authenticated delivery' },
];

export function ArchitectureBand() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <Container>
      <m.div
        className="architecture-band"
        aria-label="Sentinel architecture highlights"
        initial={prefersReducedMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, amount: 0.35 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.09 } },
        }}
      >
        {signals.map(({ icon: Icon, label, detail }, index) => (
          <m.div
            className="architecture-band__item"
            key={label}
            variants={{
              hidden: { opacity: 0, y: 14 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.52, ease: sentinelEase } },
            }}
          >
            <span className="architecture-band__index" aria-hidden="true">0{index + 1}</span>
            <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </m.div>
        ))}
      </m.div>
    </Container>
  );
}
