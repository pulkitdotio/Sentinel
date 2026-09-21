import { ArrowDown, ArrowRight } from 'lucide-react';
import { m } from 'motion/react';
import { lazy, Suspense, type ReactNode } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { StatusDot } from '../ui/StatusDot';
import { sentinelEase } from './motion-config';

const HeroBeacon = lazy(() => import('./HeroBeacon').then((module) => ({ default: module.HeroBeacon })));

export function HeroBeaconFallback() {
  return (
    <div className="beacon beacon--fallback" role="img" aria-label="Sentinel monitoring core loading">
      <div className="beacon-fallback__core" aria-hidden="true"><span /></div>
      <span className="beacon__core-label" aria-hidden="true">
        <strong>Sentinel monitoring core</strong>
        <small>Regional evidence relay</small>
      </span>
    </div>
  );
}

export function Hero({ beacon }: { beacon?: ReactNode } = {}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const entrance = (delay: number, distance = 16) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: { duration: prefersReducedMotion ? 0 : 0.62, delay: prefersReducedMotion ? 0 : delay, ease: sentinelEase },
  });

  return (
    <main id="top">
      <Container className="hero">
        <div className="hero__copy">
          <m.div className="hero__signal" {...entrance(0.16, 10)}>
            <StatusDot label="Three regions reporting" />
            <span>Every 60 seconds</span>
          </m.div>
          <h1>
            <m.span className="hero__line hero__line--primary" {...entrance(0.3, 24)}>Know when your</m.span>
            <m.span className="hero__line hero__line--accent" {...entrance(0.42, 28)}>API breaks.</m.span>
          </h1>
          <m.p className="hero__lede" {...entrance(0.58, 18)}>
            Monitor endpoints across regions, measure latency in real time, and detect
            incidents before reliability becomes guesswork.
          </m.p>
          <m.div className="hero__actions" {...entrance(0.72, 16)}>
            <ButtonLink href="#product">
              Explore the system <ArrowRight size={16} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="#monitoring" variant="quiet">
              See monitoring <ArrowDown size={15} aria-hidden="true" />
            </ButtonLink>
          </m.div>
        </div>
        <m.div className="hero__visual" {...entrance(0.84, 26)}>
          <Suspense fallback={<HeroBeaconFallback />}>
            {beacon ?? <HeroBeacon />}
          </Suspense>
        </m.div>
      </Container>
    </main>
  );
}
