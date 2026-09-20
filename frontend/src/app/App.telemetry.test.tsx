import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_TOKEN_STORAGE_KEY } from '../auth/auth-token';
import type { Incident } from '../features/incidents/api/incident-contracts';
import type { MonitorMetrics } from '../features/metrics/api/metric-contracts';
import type { Monitor } from '../features/monitors/api/monitor-contracts';
import { App } from './App';

const authenticatedUser = {
  id: 'user-1', name: 'Pulkit', email: 'pulkit@example.com',
  createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
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

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'monitor-1', userId: 'user-1', name: 'Production API', url: 'https://api.example.com/health', method: 'GET',
    intervalSeconds: 60, timeoutMs: 5_000, expectedStatusCodes: [200], latencyThresholdMs: 800,
    failureThreshold: 3, recoveryThreshold: 2, regions: ['mumbai', 'singapore', 'frankfurt'],
    isPaused: false, status: 'healthy', nextCheckAt: '2026-09-20T12:01:00.000Z',
    lastCheckedAt: '2026-09-20T12:00:00.000Z', createdAt: '2026-09-20T09:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z', ...overrides,
  };
}

function metrics(overrides: Partial<MonitorMetrics> = {}): MonitorMetrics {
  return {
    monitor: { id: 'monitor-1', name: 'Production API', status: 'down', isPaused: false, lastCheckedAt: '2026-09-20T12:00:00.000Z', regions: ['mumbai', 'singapore', 'frankfurt'] },
    range: { from: '2026-09-19T12:00:00.000Z', to: '2026-09-20T12:00:00.000Z' },
    totals: { checks: 12_847, successfulChecks: 12_844, failedChecks: 3 },
    uptimePercentage: 99.98,
    latency: { sampleCount: 12_847, averageMs: 181.25, p50Ms: 142, p95Ms: 320, p99Ms: 511 },
    regions: [
      { region: 'mumbai', totalChecks: 4_283, successfulChecks: 4_282, failedChecks: 1, uptimePercentage: 99.98, averageLatencyMs: 142.5, latestCheck: { scheduledAt: '2026-09-20T12:00:00.000Z', success: true, statusCode: 200, latencyMs: 130, errorType: null } },
      { region: 'singapore', totalChecks: 4_282, successfulChecks: 4_281, failedChecks: 1, uptimePercentage: 99.98, averageLatencyMs: 180, latestCheck: { scheduledAt: '2026-09-20T11:59:00.000Z', success: false, statusCode: 503, latencyMs: 230, errorType: 'unexpected_status' } },
      { region: 'frankfurt', totalChecks: 0, successfulChecks: 0, failedChecks: 0, uptimePercentage: null, averageLatencyMs: null, latestCheck: null },
    ],
    recentIncidents: [{ id: 'incident-1', status: 'resolved', openedAt: '2026-09-20T10:00:00.000Z', resolvedAt: '2026-09-20T10:12:44.000Z', triggerReason: 'Regional failure consensus' }],
    ...overrides,
  };
}

function check(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, monitorId: 'monitor-1', region: 'mumbai', scheduledAt: '2026-09-20T11:59:00.000Z',
    startedAt: '2026-09-20T11:59:00.100Z', completedAt: '2026-09-20T11:59:00.281Z',
    success: true, statusCode: 200, latencyMs: 181, errorType: null, ...overrides,
  };
}

function incident(id: string, overrides: Partial<Incident> = {}): Incident {
  return {
    id, userId: 'user-1', monitorId: 'monitor-1', status: 'resolved', openedAt: '2026-09-20T10:00:00.000Z',
    resolvedAt: '2026-09-20T10:12:44.000Z', triggerReason: 'Regional failure consensus',
    openingStatusEvidence: { requiredConsensus: 2, failureThreshold: 3, regions: [
      { region: 'mumbai', consecutiveFailures: 3, latestErrorType: 'timeout' },
      { region: 'singapore', consecutiveFailures: 3, latestErrorType: 'connection' },
    ] },
    events: [
      { type: 'opened', at: '2026-09-20T10:00:00.000Z', message: 'Incident opened after regional failure consensus' },
      { type: 'resolved', at: '2026-09-20T10:12:44.000Z', message: 'Incident resolved after regional recovery consensus' },
    ],
    createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:12:44.000Z', ...overrides,
  };
}

type ApiHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function mockAuthenticatedApi(handler: ApiHandler, currentMonitor = monitor()): void {
  fetchMock.mockImplementation(async (input, init) => {
    const url = requestUrl(input);
    if (url.endsWith('/api/v1/auth/me')) return jsonResponse({ user: authenticatedUser });
    if (url.endsWith('/api/v1/monitors/monitor-1')) return jsonResponse({ monitor: currentMonitor });
    return handler(url, init);
  });
}

function renderAuthenticatedApp(path: string): void {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'valid-token');
  window.history.pushState({}, '', path);
  render(<App />);
}

function checkPage(url: string, checks = [check('check-1')]) {
  const page = Number(new URL(url).searchParams.get('page') ?? '1');
  const limit = Number(new URL(url).searchParams.get('limit') ?? '25');
  return { checks, range: { from: '2026-09-19T12:00:00.000Z', to: '2026-09-20T12:00:00.000Z' }, pagination: { page, limit, total: checks.length, totalPages: checks.length === 0 ? 0 : 1 } };
}

describe('Sentinel operational monitoring workspace', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    fetchMock.mockReset();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => vi.useRealTimers());

  it('requests the default explicit 24h range and renders truthful aggregate, percentile, status, regional, and recent data', async () => {
    mockAuthenticatedApi((url) => {
      if (url.includes('/metrics?')) return jsonResponse(metrics());
      if (url.includes('/checks?')) return jsonResponse(checkPage(url, [check('check-1'), check('check-2', { success: false, statusCode: 503, latencyMs: 230, errorType: 'unexpected_status' })]));
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticatedApp('/app/monitors/monitor-1');

    expect((await screen.findAllByText('99.98%')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('181.25 ms').length).toBeGreaterThan(0);
    expect(screen.getByText('142 ms')).toBeInTheDocument();
    expect(screen.getByText('320 ms')).toBeInTheDocument();
    expect(screen.getByText('511 ms')).toBeInTheDocument();
    expect(screen.getByText('12,847')).toBeInTheDocument();
    expect(screen.getByText('Down')).toBeInTheDocument();
    expect(screen.getByText('Frankfurt')).toBeInTheDocument();
    expect(screen.getByText('No evidence')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Recent measured latency/ })).toBeInTheDocument();
    expect(screen.getByText('Regional failure consensus')).toBeInTheDocument();

    const metricRequest = fetchMock.mock.calls.map(([input]) => requestUrl(input)).find((url) => url.includes('/metrics?'));
    expect(metricRequest).toBeDefined();
    const query = new URL(metricRequest as string).searchParams;
    expect(new Date(query.get('to') as string).getTime() - new Date(query.get('from') as string).getTime()).toBe(24 * 60 * 60 * 1_000);
    expect(window.location.search).toContain('range=24h');
  });

  it('renders null metrics as no evidence rather than zero', async () => {
    const emptyMetrics = metrics({ totals: { checks: 0, successfulChecks: 0, failedChecks: 0 }, uptimePercentage: null, latency: { sampleCount: 0, averageMs: null, p50Ms: null, p95Ms: null, p99Ms: null }, recentIncidents: [] });
    emptyMetrics.monitor.status = 'pending';
    mockAuthenticatedApi((url) => url.includes('/metrics?') ? jsonResponse(emptyMetrics) : jsonResponse(checkPage(url, [])));
    renderAuthenticatedApp('/app/monitors/monitor-1');

    expect(await screen.findByText('Waiting for first regional checks.')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('0 ms')).not.toBeInTheDocument();
  });

  it('offers every bounded preset, changes request identity, and safely normalizes an invalid range', async () => {
    mockAuthenticatedApi((url) => url.includes('/metrics?') ? jsonResponse(metrics()) : jsonResponse(checkPage(url)));
    renderAuthenticatedApp('/app/monitors/monitor-1?range=invalid');
    expect((await screen.findAllByText('99.98%')).length).toBeGreaterThan(0);
    await waitFor(() => expect(window.location.search).toContain('range=24h'));
    for (const value of ['1h', '6h', '24h', '7d', '30d']) expect(screen.getByRole('button', { name: value })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '1h' }));
    await waitFor(() => {
      const requests = fetchMock.mock.calls.map(([input]) => requestUrl(input)).filter((url) => url.includes('/metrics?'));
      expect(requests.length).toBeGreaterThan(1);
      const latest = new URL(requests.at(-1) as string).searchParams;
      expect(new Date(latest.get('to') as string).getTime() - new Date(latest.get('from') as string).getTime()).toBe(60 * 60 * 1_000);
    });
  });

  it('renders successful and failed checks, nullable fields, readable errors, region filtering, and server pagination', async () => {
    mockAuthenticatedApi((url) => {
      if (!url.includes('/checks?')) throw new Error(`Unexpected request: ${url}`);
      const query = new URL(url).searchParams;
      if (query.get('region') === 'frankfurt') return jsonResponse(checkPage(url, []));
      const page = Number(query.get('page') ?? '1');
      return jsonResponse({
        ...checkPage(url, [
          check(`success-${String(page)}`),
          check(`failure-${String(page)}`, { region: 'singapore', success: false, statusCode: null, latencyMs: null, errorType: 'dns', errorMetadata: { code: 'ENOTFOUND' } }),
        ]),
        pagination: { page, limit: 25, total: 27, totalPages: 2 },
      });
    });
    renderAuthenticatedApp('/app/monitors/monitor-1/checks?range=24h&page=2');

    expect(await screen.findByText('DNS failure')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Page/).parentElement).toHaveTextContent('Page 2 of 2');

    await userEvent.selectOptions(screen.getByLabelText('Region'), 'frankfurt');
    await waitFor(() => expect(window.location.search).not.toContain('page='));
    expect(await screen.findByText('No checks match this view.')).toBeInTheDocument();
    const latest = fetchMock.mock.calls.map(([input]) => requestUrl(input)).filter((url) => url.includes('/checks?')).at(-1) as string;
    expect(new URL(latest).searchParams.get('region')).toBe('frankfurt');
    expect(new URL(latest).searchParams.get('page')).toBe('1');
  });

  it('distinguishes an unfiltered never-observed check state', async () => {
    mockAuthenticatedApi((url) => jsonResponse(checkPage(url, [])), monitor({ lastCheckedAt: null, status: 'pending' }));
    renderAuthenticatedApp('/app/monitors/monitor-1/checks');
    expect(await screen.findByText('Waiting for first regional checks.')).toBeInTheDocument();
  });

  it('renders open and resolved incident history with backend pagination', async () => {
    mockAuthenticatedApi((url) => {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      return jsonResponse({ incidents: [incident(`resolved-${String(page)}`), incident(`open-${String(page)}`, { status: 'open', resolvedAt: null, events: [{ type: 'opened', at: '2026-09-20T11:00:00.000Z', message: 'Incident opened' }] })], pagination: { page, limit: 20, total: 22, totalPages: 2 } });
    });
    renderAuthenticatedApp('/app/monitors/monitor-1/incidents');

    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getAllByText('Ongoing').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    await waitFor(() => expect(window.location.search).toContain('page=2'));
    expect(await screen.findByText(/Page/).then((node) => node.parentElement)).toHaveTextContent('Page 2 of 2');
  });

  it('renders incident association, opening evidence, exact backend timeline, and duration', async () => {
    mockAuthenticatedApi((url) => {
      if (url.endsWith('/api/v1/incidents/incident-1')) return jsonResponse({ incident: incident('incident-1') });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticatedApp('/app/incidents/incident-1');

    expect(await screen.findByRole('heading', { name: 'Resolved incident' })).toBeInTheDocument();
    expect(await screen.findByText('Production API')).toBeInTheDocument();
    expect(screen.getByText('2 regions')).toBeInTheDocument();
    expect(screen.getByText('3 consecutive checks')).toBeInTheDocument();
    expect(screen.getByText('Timeout')).toBeInTheDocument();
    expect(screen.getByText('Connection failure')).toBeInTheDocument();
    expect(screen.getByText('12m 44s')).toBeInTheDocument();
    const timeline = screen.getByRole('list');
    expect(within(timeline).getByText('Incident opened')).toBeInTheDocument();
    expect(within(timeline).getByText('Incident resolved')).toBeInTheDocument();
  });

  it('renders the ownership-safe incident not-found state', async () => {
    mockAuthenticatedApi(() => jsonResponse({ error: { code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' } }, 404));
    renderAuthenticatedApp('/app/incidents/missing');
    expect(await screen.findByRole('heading', { name: 'Incident not found.' })).toBeInTheDocument();
    expect(screen.queryByText(/user-1/)).not.toBeInTheDocument();
  });

  it('exposes Overview, Checks, Incidents, and Configuration navigation without realtime or AI requests', async () => {
    mockAuthenticatedApi((url) => url.includes('/metrics?') ? jsonResponse(metrics()) : jsonResponse(checkPage(url)));
    renderAuthenticatedApp('/app/monitors/monitor-1');
    const navigation = await screen.findByRole('navigation', { name: 'Monitor sections' });
    for (const label of ['Overview', 'Checks', 'Incidents', 'Configuration']) expect(within(navigation).getByRole('link', { name: label })).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input));
    expect(urls.some((url) => /socket|ai-insights|ai-summary|ai-analyses/.test(url))).toBe(false);
  });
});
