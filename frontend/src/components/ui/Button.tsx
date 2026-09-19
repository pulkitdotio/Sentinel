import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet';
}

export function ButtonLink({ children, className, variant = 'primary', ...props }: ButtonLinkProps) {
  return (
    <a className={cn('button', `button--${variant}`, className)} {...props}>
      {children}
    </a>
  );
}
