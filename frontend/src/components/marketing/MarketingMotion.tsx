import { LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';
import type { ReactNode } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../lib/cn';
import { sentinelEase } from './motion-config';

export function MarketingMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  amount?: number;
}

export function Reveal({
  children,
  className,
  delay = 0,
  distance = 22,
  amount = 0.18,
}: RevealProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <m.div
      className={cn('motion-reveal', className)}
      data-motion-reveal="true"
      initial={prefersReducedMotion ? false : { opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.68, delay: prefersReducedMotion ? 0 : delay, ease: sentinelEase }}
    >
      {children}
    </m.div>
  );
}
