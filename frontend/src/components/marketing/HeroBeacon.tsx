import { useElementVisibility } from '../../hooks/useElementVisibility';
import { cn } from '../../lib/cn';

export function HeroBeacon() {
  const { ref, isVisible } = useElementVisibility<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn('beacon', isVisible && 'beacon--active')}
      role="img"
      aria-label="Abstract distributed monitoring beacon connecting three regional probes"
    >
      <div className="beacon__scene" aria-hidden="true">
        <div className="beacon__object">
          <span className="beacon__face beacon__face--front" />
          <span className="beacon__face beacon__face--back" />
          <span className="beacon__face beacon__face--left" />
          <span className="beacon__face beacon__face--right" />
          <span className="beacon__heart" />
        </div>
        <span className="beacon__path beacon__path--one"><i /></span>
        <span className="beacon__path beacon__path--two"><i /></span>
        <span className="beacon__path beacon__path--three"><i /></span>
        <span className="beacon__node beacon__node--one" />
        <span className="beacon__node beacon__node--two" />
        <span className="beacon__node beacon__node--three" />
      </div>
      <span className="beacon__label beacon__label--one">BOM · 142ms</span>
      <span className="beacon__label beacon__label--two">SIN · 187ms</span>
      <span className="beacon__label beacon__label--three">FRA · 165ms</span>
    </div>
  );
}
