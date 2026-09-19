import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Brand } from '../ui/Brand';
import { ButtonRouteLink } from '../ui/Button';
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
          <Link className="navbar__signin" to="/login">Sign in</Link>
          <ButtonRouteLink to="/register" className="navbar__cta">
            Start monitoring <ArrowUpRight size={14} aria-hidden="true" />
          </ButtonRouteLink>
        </div>
      </Container>
    </header>
  );
}
