import { ArrowUpRight } from 'lucide-react';

import { Brand } from '../ui/Brand';
import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Container';

export function Navbar() {
  return (
    <header className="navbar">
      <Container className="navbar__inner">
        <Brand />
        <nav className="navbar__links" aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#monitoring">Monitoring</a>
          <a href="#architecture">Architecture</a>
        </nav>
        <div className="navbar__actions">
          <span className="navbar__future" title="Authentication arrives in Frontend Phase 1">
            Sign in
          </span>
          <ButtonLink href="#final-cta" className="navbar__cta">
            Start monitoring <ArrowUpRight size={14} aria-hidden="true" />
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
