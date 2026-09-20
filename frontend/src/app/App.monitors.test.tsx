import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_TOKEN_STORAGE_KEY } from '../auth/auth-token';
import type { Monitor, MonitorStatus } from '../features/monitors/api/monitor-contracts';
import { App } from './App';

const authenticatedUser = {
  id: 'user-1',
  name: 'Pulkit',
  email: 'pulkit@example.com',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

type ApiHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockAuthenticatedApi(handler: ApiHandler): void {
  fetchMock.mockImplementation(async (input, init) => {
    const url = requestUrl(input);
    if (url.endsWith('/api/v1/auth/me')) return jsonResponse({ user: authenticatedUser });
    return handler(url, init);
  });
}

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'monitor-1',
    userId: authenticatedUser.id,
    name: 'Production API',
    url: 'https://api.example.com/health',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 800,
    failureThreshold: 3,
    recoveryThreshold: 2,
    regions: ['mumbai', 'singapore', 'frankfurt'],
    isPaused: false,
    status: 'healthy',
    nextCheckAt: '2026-09-20T10:01:00.000Z',
    lastCheckedAt: '2026-09-20T10:00:00.000Z',
    createdAt: '2026-09-20T09:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  };
}

function openRoute(path: string): void {
  window.history.pushState({}, '', path);
}

function renderAuthenticatedApp(path: string): void {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'valid-token');
  openRoute(path);
  render(<App />);
}

function bodyOf(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string') return undefined;
  return JSON.parse(init.body) as unknown;
}

describe('Sentinel monitor workspace', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    openRoute('/');
  });

  it('renders the authenticated shell and navigates between Overview and Monitors', async () => {
    mockAuthenticatedApi(() => jsonResponse({ monitors: [] }));
    renderAuthenticatedApp('/app');

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    expect(screen.getByText('Pulkit')).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' });
    expect(within(navigation).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(within(navigation).getByRole('link', { name: 'Monitors' }));
    expect(await screen.findByRole('heading', { name: 'Monitors' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app/monitors');
  });

  it('fetches the monitor list and renders the polished empty state without later-phase calls', async () => {
    mockAuthenticatedApi((url) => {
      expect(url).toBe('http://localhost:4000/api/v1/monitors');
      return jsonResponse({ monitors: [] });
    });
    renderAuthenticatedApp('/app');

    expect(await screen.findByRole('heading', { name: 'Nothing to monitor yet.' })).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input));
    expect(urls.some((url) => /metrics|checks|incidents|ai-insights/.test(url))).toBe(false);
  });

  it('renders multiple monitors and every supported status', async () => {
    const statuses: MonitorStatus[] = ['pending', 'healthy', 'degraded', 'down', 'paused'];
    const monitors = statuses.map((status, index) => monitor({
      id: `monitor-${index}`,
      name: `${status} service`,
      status,
      isPaused: status === 'paused',
      lastCheckedAt: status === 'pending' ? null : '2026-09-20T10:00:00.000Z',
    }));
    mockAuthenticatedApi(() => jsonResponse({ monitors }));
    renderAuthenticatedApp('/app/monitors');

    expect(await screen.findByText('healthy service')).toBeInTheDocument();
    for (const status of ['Pending', 'Healthy', 'Degraded', 'Down', 'Paused']) {
      expect(screen.getByText(status)).toBeInTheDocument();
    }
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
  });

  it('shows a skeleton while the monitor list is loading', async () => {
    let resolveList: ((response: Response) => void) | undefined;
    const pendingList = new Promise<Response>((resolve) => { resolveList = resolve; });
    mockAuthenticatedApi(() => pendingList);
    renderAuthenticatedApp('/app/monitors');

    expect(await screen.findByRole('status', { name: 'Loading monitors' })).toBeInTheDocument();
    act(() => resolveList?.(jsonResponse({ monitors: [] })));
    expect(await screen.findByRole('heading', { name: 'Nothing to monitor yet.' })).toBeInTheDocument();
  });

  it('shows a retryable network error for the monitor list', async () => {
    mockAuthenticatedApi(() => { throw new TypeError('offline'); });
    renderAuthenticatedApp('/app/monitors');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to reach Sentinel');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('announces required create fields without sending a request', async () => {
    mockAuthenticatedApi(() => { throw new Error('Unexpected monitor request'); });
    renderAuthenticatedApp('/app/monitors/new');
    expect(await screen.findByRole('heading', { name: 'Create a monitor' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create monitor' }));
    expect(await screen.findByText('Enter a monitor name')).toBeInTheDocument();
    expect(screen.getByText('Enter an endpoint URL')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a monitor with the exact API payload and navigates to its resource', async () => {
    const created = monitor({ id: 'created-monitor', name: 'Checkout API', status: 'pending', lastCheckedAt: null });
    mockAuthenticatedApi((url, init) => {
      if (url.endsWith('/api/v1/monitors') && init?.method === 'POST') return jsonResponse({ monitor: created }, 201);
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticatedApp('/app/monitors/new');
    await screen.findByRole('heading', { name: 'Create a monitor' });

    await userEvent.type(screen.getByLabelText('Monitor name'), '  Checkout API  ');
    await userEvent.type(screen.getByLabelText('Endpoint URL'), 'https://api.example.com/health');
    await userEvent.click(screen.getByRole('button', { name: 'Create monitor' }));

    expect(await screen.findByRole('heading', { name: 'Checkout API' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app/monitors/created-monitor');
    const post = fetchMock.mock.calls.find(([input, init]) => requestUrl(input).endsWith('/monitors') && init?.method === 'POST');
    expect(bodyOf(post?.[1])).toEqual({
      name: 'Checkout API',
      url: 'https://api.example.com/health',
      method: 'GET',
      intervalSeconds: 60,
      timeoutMs: 5_000,
      expectedStatusCodes: [200],
      latencyThresholdMs: 800,
      failureThreshold: 3,
      recoveryThreshold: 2,
      regions: ['mumbai', 'singapore', 'frankfurt'],
    });
  });

  it('fetches an owned monitor and initializes every configuration field', async () => {
    const current = monitor();
    mockAuthenticatedApi((url) => {
      expect(url).toContain('/api/v1/monitors/monitor-1');
      return jsonResponse({ monitor: current });
    });
    renderAuthenticatedApp('/app/monitors/monitor-1/configuration');

    expect(await screen.findByRole('heading', { name: 'Production API' })).toBeInTheDocument();
    expect(screen.getByLabelText('Monitor name')).toHaveValue('Production API');
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://api.example.com/health');
    expect(screen.getByLabelText('HTTP method')).toHaveValue('GET');
    expect(screen.getByLabelText('Expected status codes')).toHaveValue('200');
    expect(screen.getByRole('group', { name: 'Probe regions' })).toBeInTheDocument();
  });

  it('renders the owner-safe monitor not-found state', async () => {
    mockAuthenticatedApi(() => jsonResponse({ error: { code: 'MONITOR_NOT_FOUND', message: 'Monitor not found' } }, 404));
    renderAuthenticatedApp('/app/monitors/missing-monitor');

    expect(await screen.findByRole('heading', { name: 'Monitor not found.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to monitors' })).toBeInTheDocument();
  });

  it('edits a monitor with a PATCH containing only changed mutable fields', async () => {
    const current = monitor();
    const updated = monitor({ name: 'Renamed API', updatedAt: '2026-09-20T10:02:00.000Z' });
    mockAuthenticatedApi((url, init) => {
      if (init?.method === 'PATCH') return jsonResponse({ monitor: updated });
      if (url.endsWith('/api/v1/monitors/monitor-1')) return jsonResponse({ monitor: current });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticatedApp('/app/monitors/monitor-1/configuration');
    await screen.findByRole('heading', { name: 'Production API' });

    await userEvent.clear(screen.getByLabelText('Monitor name'));
    await userEvent.type(screen.getByLabelText('Monitor name'), 'Renamed API');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Configuration saved.')).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(bodyOf(patchCall?.[1])).toEqual({ name: 'Renamed API' });
    expect(bodyOf(patchCall?.[1])).not.toHaveProperty('status');
    expect(bodyOf(patchCall?.[1])).not.toHaveProperty('nextCheckAt');
  });

  it('uses the dedicated pause endpoint and disables repeated actions while pending', async () => {
    let resolvePause: ((response: Response) => void) | undefined;
    const pendingPause = new Promise<Response>((resolve) => { resolvePause = resolve; });
    mockAuthenticatedApi((url, init) => {
      if (url.endsWith('/pause') && init?.method === 'POST') return pendingPause;
      return jsonResponse({ monitor: monitor() });
    });
    renderAuthenticatedApp('/app/monitors/monitor-1/configuration');
    await screen.findByRole('heading', { name: 'Production API' });

    await userEvent.click(screen.getByRole('button', { name: 'Pause monitoring' }));
    expect(screen.getByRole('button', { name: 'Pausing…' })).toBeDisabled();
    const pauseCall = fetchMock.mock.calls.find(([input]) => requestUrl(input).endsWith('/pause'));
    expect(pauseCall?.[1]?.method).toBe('POST');
    act(() => resolvePause?.(jsonResponse({ monitor: monitor({ isPaused: true, status: 'paused', updatedAt: '2026-09-20T10:03:00.000Z' }) })));
    expect(await screen.findByRole('button', { name: 'Resume monitoring' })).toBeInTheDocument();
  });

  it('uses the dedicated resume endpoint for a paused monitor', async () => {
    const paused = monitor({ isPaused: true, status: 'paused' });
    mockAuthenticatedApi((url, init) => {
      if (url.endsWith('/resume') && init?.method === 'POST') return jsonResponse({ monitor: monitor({ status: 'pending', updatedAt: '2026-09-20T10:04:00.000Z' }) });
      return jsonResponse({ monitor: paused });
    });
    renderAuthenticatedApp('/app/monitors/monitor-1/configuration');
    await screen.findByRole('heading', { name: 'Production API' });

    await userEvent.click(screen.getByRole('button', { name: 'Resume monitoring' }));
    expect(await screen.findByRole('button', { name: 'Pause monitoring' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith('/resume'))).toBe(true);
  });

  it('requires deletion confirmation, supports cancel, handles 204, and returns to Monitors', async () => {
    mockAuthenticatedApi((url, init) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.endsWith('/api/v1/monitors/monitor-1')) return jsonResponse({ monitor: monitor() });
      if (url.endsWith('/api/v1/monitors')) return jsonResponse({ monitors: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticatedApp('/app/monitors/monitor-1/configuration');
    await screen.findByRole('heading', { name: 'Production API' });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    let dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete Production API?');
    expect(dialog).toHaveTextContent('cannot be undone');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete monitor' }));

    await waitFor(() => expect(window.location.pathname).toBe('/app/monitors'));
    expect(await screen.findByRole('heading', { name: 'Monitors' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });
});
