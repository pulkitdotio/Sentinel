import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Hero } from './Hero';
import { MarketingMotionProvider } from './MarketingMotion';

describe('Hero progressive loading', () => {
  function PendingBeacon(): never {
    const pending = new Promise<void>(() => undefined);
    throw Object.assign(new Error('Beacon chunk is still loading'), {
      then: pending.then.bind(pending),
    });
  }

  it('renders the copy and a visual fallback while the beacon chunk is loading', () => {
    render(
      <MarketingMotionProvider>
        <Hero beacon={<PendingBeacon />} />
      </MarketingMotionProvider>,
    );

    expect(screen.getByRole('heading', { name: /know when your.?api breaks/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sentinel monitoring core loading' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /explore the system/i })).toHaveAttribute('href', '#product');
  });
});
