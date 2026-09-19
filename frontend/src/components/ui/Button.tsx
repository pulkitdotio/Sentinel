import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

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

interface ButtonRouteLinkProps extends LinkProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet';
}

export function ButtonRouteLink({ children, className, variant = 'primary', ...props }: ButtonRouteLinkProps) {
  return (
    <Link className={cn('button', `button--${variant}`, className)} {...props}>
      {children}
    </Link>
  );
}
