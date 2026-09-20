import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApplicationErrorBoundary } from './ApplicationErrorBoundary';

function BrokenView(): never {
  throw new Error('render failed');
}

describe('ApplicationErrorBoundary', () => {
  it('shows safe recovery copy and invokes the reload action', async () => {
    const reloadApplication = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ApplicationErrorBoundary reloadApplication={reloadApplication}>
        <BrokenView />
      </ApplicationErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Sentinel hit an unexpected problem.' })).toBeInTheDocument();
    expect(screen.getByText('Your monitoring data is still stored on the server.')).toBeInTheDocument();
    expect(screen.queryByText('render failed')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reload application' }));
    expect(reloadApplication).toHaveBeenCalledOnce();
  });
});
