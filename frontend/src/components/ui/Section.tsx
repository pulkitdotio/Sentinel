import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
}

export function Section({ children, className, eyebrow, ...props }: SectionProps) {
  return (
    <section className={cn('section', className)} {...props}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      {children}
    </section>
  );
}
