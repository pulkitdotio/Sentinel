import { ArrowDown, ArrowRight } from 'lucide-react';

import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { StatusDot } from '../ui/StatusDot';
import { HeroBeacon } from './HeroBeacon';

export function Hero() {
  return (
    <main id="top">
      <Container className="hero">
        <div className="hero__copy">
          <div className="hero__signal">
            <StatusDot label="Three regions reporting" />
            <span>Every 60 seconds</span>
          </div>
          <h1>
            Know when your
            <span>API breaks.</span>
          </h1>
          <p className="hero__lede">
            Monitor endpoints across regions, measure latency in real time, and detect
            incidents before reliability becomes guesswork.
          </p>
          <div className="hero__actions">
            <ButtonLink href="#product">
              Explore the system <ArrowRight size={16} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="#monitoring" variant="quiet">
              See monitoring <ArrowDown size={15} aria-hidden="true" />
            </ButtonLink>
          </div>
        </div>
        <HeroBeacon />
      </Container>
    </main>
  );
}
