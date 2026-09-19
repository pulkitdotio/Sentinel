import { Activity, Database, RadioTower, Workflow } from 'lucide-react';

import { Container } from '../ui/Container';

const signals = [
  { icon: RadioTower, label: 'Regional probes', detail: 'Independent checks' },
  { icon: Database, label: 'Durable evidence', detail: 'MongoDB history' },
  { icon: Workflow, label: 'Deterministic state', detail: 'Threshold consensus' },
  { icon: Activity, label: 'Realtime events', detail: 'Authenticated delivery' },
];

export function ArchitectureBand() {
  return (
    <Container>
      <div className="architecture-band" aria-label="Sentinel architecture highlights">
        {signals.map(({ icon: Icon, label, detail }) => (
          <div className="architecture-band__item" key={label}>
            <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </div>
        ))}
      </div>
    </Container>
  );
}
