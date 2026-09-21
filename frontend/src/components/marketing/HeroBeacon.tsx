import { Activity } from 'lucide-react';
import { m, useMotionValue, useSpring } from 'motion/react';
import type { PointerEvent } from 'react';

import { useElementVisibility } from '../../hooks/useElementVisibility';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../lib/cn';
import { sentinelEase } from './motion-config';

const desktopPaths = [
  'M 132 151 C 206 160, 266 218, 350 276',
  'M 585 145 C 514 160, 456 218, 370 276',
  'M 560 438 C 493 410, 434 350, 369 294',
];

const mobilePaths = [
  'M 154 106 C 220 142, 274 208, 350 276',
  'M 568 196 C 492 206, 430 238, 370 279',
  'M 502 458 C 456 410, 413 350, 368 296',
];

const pathDelay = [0, 1.2, 2.4];

function SignalPaths({ active, mobile = false }: { active: boolean; mobile?: boolean }) {
  const paths = mobile ? mobilePaths : desktopPaths;

  return (
    <g className={mobile ? 'beacon-network__mobile' : 'beacon-network__desktop'}>
      {paths.map((path, index) => (
        <g key={path}>
          <m.path
            className="beacon-network__path"
            d={path}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.85, delay: 0.92 + index * 0.1, ease: sentinelEase }}
          />
          <m.path
            className="beacon-network__signal"
            d={path}
            initial={false}
            animate={active
              ? { pathLength: [0.02, 0.18, 0.02], pathOffset: [0, 0.82, 0.98], opacity: [0, 1, 0] }
              : { pathLength: 0, pathOffset: 0, opacity: 0 }}
            transition={{ duration: 3.6, delay: pathDelay[index], repeat: active ? Infinity : 0, ease: 'linear' }}
          />
        </g>
      ))}
    </g>
  );
}

export function HeroBeacon() {
  const { ref, isVisible } = useElementVisibility<HTMLDivElement>();
  const prefersReducedMotion = usePrefersReducedMotion();
  const tiltXValue = useMotionValue(0);
  const tiltYValue = useMotionValue(0);
  const tiltX = useSpring(tiltXValue, { stiffness: 95, damping: 18, mass: 0.75 });
  const tiltY = useSpring(tiltYValue, { stiffness: 95, damping: 18, mass: 0.75 });
  const shouldAnimate = isVisible && !prefersReducedMotion;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    tiltXValue.set(y * -5);
    tiltYValue.set(x * 6);
  };

  const resetTilt = () => {
    tiltXValue.set(0);
    tiltYValue.set(0);
  };

  return (
    <div
      ref={ref}
      className={cn('beacon', shouldAnimate && 'beacon--active')}
      role="img"
      aria-label="Sentinel monitoring core receiving health-check signals from Mumbai, Singapore, and Frankfurt"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      <m.div className="beacon__tilt" style={{ rotateX: tiltX, rotateY: tiltY }}>
        <div className="beacon__field" aria-hidden="true" />
        <svg className="beacon-network" viewBox="0 0 720 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <linearGradient id="beacon-path-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6f8078" stopOpacity=".2" />
              <stop offset=".72" stopColor="#86c99c" stopOpacity=".62" />
              <stop offset="1" stopColor="#b0ebc3" stopOpacity=".9" />
            </linearGradient>
            <filter id="beacon-signal-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <SignalPaths active={shouldAnimate} />
          <SignalPaths active={shouldAnimate} mobile />
        </svg>

        <div className="beacon-core" aria-hidden="true">
          <span className="beacon-core__plane beacon-core__plane--one" />
          <span className="beacon-core__plane beacon-core__plane--two" />
          <span className="beacon-core__orbit beacon-core__orbit--outer"><i /></span>
          <span className="beacon-core__orbit beacon-core__orbit--inner"><i /></span>
          <span className="beacon-core__halo" />
          <span className="beacon-core__aperture">
            <Activity size={25} strokeWidth={1.45} />
            <i /><i /><i />
          </span>
        </div>

        <div className="beacon-probe beacon-probe--bom" aria-hidden="true">
          <span className="beacon-probe__marker"><i /></span>
          <span className="beacon-probe__label"><strong>BOM</strong><small>142ms</small></span>
        </div>
        <div className="beacon-probe beacon-probe--sin" aria-hidden="true">
          <span className="beacon-probe__marker"><i /></span>
          <span className="beacon-probe__label"><strong>SIN</strong><small>187ms</small></span>
        </div>
        <div className="beacon-probe beacon-probe--fra" aria-hidden="true">
          <span className="beacon-probe__marker"><i /></span>
          <span className="beacon-probe__label"><strong>FRA</strong><small>165ms</small></span>
        </div>
      </m.div>

      <span className="beacon__core-label" aria-hidden="true">
        <strong>Sentinel monitoring core</strong>
        <small>Regional evidence relay</small>
      </span>
    </div>
  );
}
