import { ArrowUpRight } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../lib/cn';
import { Brand } from '../ui/Brand';
import { ButtonRouteLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { sentinelEase } from './motion-config';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const updateScrolledState = () => setIsScrolled(window.scrollY > 24);
    updateScrolledState();
    window.addEventListener('scroll', updateScrolledState, { passive: true });
    return () => window.removeEventListener('scroll', updateScrolledState);
  }, []);

  return (
    <m.header
      className={cn('navbar', isScrolled && 'navbar--scrolled')}
      initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: sentinelEase }}
    >
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
    </m.header>
  );
}
