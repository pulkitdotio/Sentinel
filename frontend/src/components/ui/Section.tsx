import { m } from 'motion/react';
import type { HTMLAttributes } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../lib/cn';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
}

export function Section({ children, className, eyebrow, ...props }: SectionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <section className={cn('section', className)} {...props}>
      {eyebrow ? (
        <m.p
          className="eyebrow"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.48, ease: [0.22, 1, 0.36, 1] }}
        >
          {eyebrow}
        </m.p>
      ) : null}
      {children}
    </section>
  );
}
