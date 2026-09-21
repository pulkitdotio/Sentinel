import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CheckResult } from '../api/check-contracts';
import { RecentLatencyChart } from './RecentLatencyChart';

function check(id: string, region: string, latencyMs: number, success = true): CheckResult {
  return {
    id,
    monitorId: 'monitor-1',
    region,
    scheduledAt: '2026-09-20T11:59:00.000Z',
    startedAt: '2026-09-20T11:59:00.000Z',
    completedAt: '2026-09-20T11:59:01.000Z',
    success,
    statusCode: success ? 200 : 503,
    latencyMs,
    errorType: success ? null : 'unexpected_status',
  };
}

describe('RecentLatencyChart', () => {
  it('keeps every plotted point keyboard accessible and reveals its truthful tooltip', () => {
    const { container } = render(
      <RecentLatencyChart checks={[check('check-2', 'singapore', 187), check('check-1', 'mumbai', 142)]} />,
    );

    expect(container.querySelectorAll('.latency-chart__point')).toHaveLength(2);
    const mumbaiPoint = screen.getByRole('img', { name: 'Mumbai: 142 ms · success' });
    fireEvent.focus(mumbaiPoint);
    expect(screen.getByText('Mumbai · 142 ms')).toBeInTheDocument();
    fireEvent.blur(mumbaiPoint);
    expect(screen.queryByText('Mumbai · 142 ms')).not.toBeInTheDocument();
  });

  it('does not fabricate a line when only one measured sample exists', () => {
    const { container } = render(<RecentLatencyChart checks={[check('check-1', 'mumbai', 142)]} />);
    expect(container.querySelector('.latency-chart__line')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.latency-chart__point')).toHaveLength(1);
  });
});
