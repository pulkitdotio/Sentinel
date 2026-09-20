import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_TOKEN_STORAGE_KEY, setAuthToken } from '../auth/auth-token';
import { monitorCheckKeys } from '../features/checks/api/check-keys';
import { incidentKeys, monitorIncidentKeys } from '../features/incidents/api/incident-keys';
import { monitorMetricKeys } from '../features/metrics/api/metric-keys';
import type { IsoTimeRange } from '../features/metrics/time-range';
import type { Monitor } from '../features/monitors/api/monitor-contracts';
import { monitorKeys } from '../features/monitors/api/monitor-keys';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { RealtimeStatus } from '../realtime/RealtimeStatus';
import {
  getFakeSocketCreations,
  type FakeSocket,
} from '../test/fake-socket-io-client';
import { App } from './App';

const MONITOR_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MONITOR_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CHECK_ID = 'cccccccccccccccccccccccc';
const INCIDENT_ID = 'dddddddddddddddddddddddd';
const RANGE: IsoTimeRange = {
  from: '2026-09-19T10:00:00.000Z',
  to: '2026-09-20T10:00:00.000Z',
};

const user = {
  id: 'user-1',
  name: 'Pulkit',
  email: 'pulkit@example.com',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const monitorA: Monitor = {
  id: MONITOR_A,
  userId: user.id,
  name: 'API A',
  url: 'https://a.example.com/health',
  method: 'GET',
  intervalSeconds: 30,
  timeoutMs: 5_000,
  expectedStatusCodes: [200],
  latencyThresholdMs: 800,
  failureThreshold: 3,
  recoveryThreshold: 2,
  regions: ['mumbai'],
  isPaused: false,
  status: 'healthy',
  nextCheckAt: '2026-09-20T10:01:00.000Z',
  lastCheckedAt: '2026-09-20T10:00:00.000Z',
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const monitorB: Monitor = { ...monitorA, id: MONITOR_B, name: 'API B' };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockAuthenticatedRest(): void {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user }));
    if (url.endsWith('/monitors')) return Promise.resolve(jsonResponse({ monitors: [] }));
    throw new Error(`Unexpected request: ${url}`);
  }));
}

function openRoute(path: string): void {
  window.history.pushState({}, '', path);
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function RealtimeHarness({ children }: { children?: ReactNode }) {
  return (
    <RealtimeProvider>
      <RealtimeStatus />
      {children}
    </RealtimeProvider>
  );
}

function renderRealtime(queryClient = createQueryClient()) {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'socket-token');
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RealtimeHarness />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function latestSocket(): FakeSocket {
  const socket = getFakeSocketCreations().at(-1)?.socket;
  if (!socket) throw new Error('Expected a realtime socket');
  return socket;
}

function seedRealtimeQueries(queryClient: QueryClient): void {
  queryClient.setQueryData(monitorKeys.list(), [monitorA, monitorB]);
  queryClient.setQueryData(monitorKeys.detail(MONITOR_A), monitorA);
  queryClient.setQueryData(monitorKeys.detail(MONITOR_B), monitorB);
  queryClient.setQueryData(monitorMetricKeys.detail(MONITOR_A, RANGE), { marker: 'metrics-a' });
  queryClient.setQueryData(monitorMetricKeys.detail(MONITOR_B, RANGE), { marker: 'metrics-b' });
  queryClient.setQueryData(monitorCheckKeys.list(MONITOR_A, { range: RANGE, page: 1, limit: 25 }), { marker: 'checks-a' });
  queryClient.setQueryData(monitorCheckKeys.list(MONITOR_B, { range: RANGE, page: 1, limit: 25 }), { marker: 'checks-b' });
  queryClient.setQueryData(monitorIncidentKeys.list(MONITOR_A, 1, 20), { marker: 'incidents-a' });
  queryClient.setQueryData(monitorIncidentKeys.list(MONITOR_B, 1, 20), { marker: 'incidents-b' });
  queryClient.setQueryData(incidentKeys.detail(INCIDENT_ID), { marker: 'incident-detail' });
}

const checkCompleted = {
  checkResultId: CHECK_ID,
  monitorId: MONITOR_A,
  region: 'mumbai',
  scheduledAt: '2026-09-20T10:00:00.000Z',
  success: true,
  statusCode: 200,
  latencyMs: 120,
  errorType: null,
};

describe('authenticated realtime lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000/');
    openRoute('/');
  });

  it.each(['/', '/login', '/register'])('does not create a socket on public route %s', (path) => {
    openRoute(path);
    render(<App />);
    expect(getFakeSocketCreations()).toHaveLength(0);
  });

  it('keeps the landing page socket-free while a stored session is restored', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'current-jwt');
    mockAuthenticatedRest();
    openRoute('/');
    render(<App />);

    expect(await screen.findByRole('heading', { name: /know when your.?api breaks/i })).toBeInTheDocument();
    expect(getFakeSocketCreations()).toHaveLength(0);
  });

  it('creates one socket with the current JWT and backend origin across rerenders', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'current-jwt');
    mockAuthenticatedRest();
    openRoute('/app');
    const view = render(<App />);

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    expect(getFakeSocketCreations()).toHaveLength(1);
    expect(getFakeSocketCreations()[0]).toMatchObject({
      url: 'http://localhost:4000',
      options: { auth: { token: 'current-jwt' }, reconnection: true },
    });

    view.rerender(<App />);
    expect(getFakeSocketCreations()).toHaveLength(1);
  });

  it('shows connection state without letting a socket failure clear auth', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'current-jwt');
    mockAuthenticatedRest();
    openRoute('/app');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();

    const socket = latestSocket();
    act(() => socket.emitServer('connect'));
    expect(screen.getAllByText('Live')).toHaveLength(2);

    socket.active = true;
    act(() => socket.emitServer('disconnect', 'transport close'));
    expect(screen.getAllByText('Reconnecting')).toHaveLength(2);

    socket.active = false;
    act(() => socket.emitServer('connect_error', new Error('Authentication failed')));
    expect(screen.getAllByText('Realtime offline')).toHaveLength(2);
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('current-jwt');
    expect(screen.getByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
  });

  it('disconnects on logout and provider unmount', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'current-jwt');
    mockAuthenticatedRest();
    openRoute('/app');
    const view = render(<App />);
    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    const logoutSocket = latestSocket();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(logoutSocket.disconnected).toBe(true));
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();

    view.unmount();
    const realtimeView = renderRealtime();
    const unmountSocket = latestSocket();
    realtimeView.unmount();
    expect(unmountSocket.disconnected).toBe(true);
  });

  it('replaces the socket cleanly when the token changes', async () => {
    const view = renderRealtime();
    expect(getFakeSocketCreations()).toHaveLength(1);
    const firstSocket = latestSocket();

    act(() => setAuthToken('replacement-token'));
    await waitFor(() => expect(getFakeSocketCreations()).toHaveLength(2));
    expect(firstSocket.disconnected).toBe(true);
    expect(getFakeSocketCreations()[1]?.options).toMatchObject({ auth: { token: 'replacement-token' } });
    view.unmount();
  });
});

describe('realtime validation and query reconciliation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
  });

  it('accepts valid check events, rejects malformed payloads, and coalesces by monitor', () => {
    vi.useFakeTimers();
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderRealtime(queryClient);
    const socket = latestSocket();

    act(() => {
      socket.emitServer('check.completed', { ...checkCompleted, monitorId: 'not-an-object-id' });
      socket.emitServer('check.completed', checkCompleted);
      socket.emitServer('check.completed', { ...checkCompleted, region: 'singapore' });
      socket.emitServer('check.completed', { ...checkCompleted, region: 'frankfurt' });
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      monitorMetricKeys.byMonitor(MONITOR_A),
      monitorCheckKeys.byMonitor(MONITOR_A),
      monitorKeys.detail(MONITOR_A),
      monitorKeys.list(),
    ]);
    expect(invalidate.mock.calls.some(([filters]) =>
      JSON.stringify(filters?.queryKey).includes(MONITOR_B))).toBe(false);
    vi.useRealTimers();
  });

  it('patches a valid targeted status and rejects invalid or stale transitions', () => {
    const queryClient = createQueryClient();
    seedRealtimeQueries(queryClient);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderRealtime(queryClient);
    const socket = latestSocket();

    act(() => socket.emitServer('monitor.status_changed', {
      monitorId: MONITOR_A,
      previousStatus: 'healthy',
      status: 'down',
      changedAt: '2026-09-20T10:01:00.000Z',
    }));
    expect(queryClient.getQueryData<Monitor>(monitorKeys.detail(MONITOR_A))?.status).toBe('down');
    expect(queryClient.getQueryData<Monitor[]>(monitorKeys.list())?.[0]?.status).toBe('down');
    expect(queryClient.getQueryData<Monitor>(monitorKeys.detail(MONITOR_B))?.status).toBe('healthy');
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      monitorKeys.detail(MONITOR_A),
      monitorKeys.list(),
      monitorMetricKeys.byMonitor(MONITOR_A),
    ]);

    invalidate.mockClear();
    act(() => socket.emitServer('monitor.status_changed', {
      monitorId: MONITOR_A,
      previousStatus: 'down',
      status: 'unknown',
      changedAt: '2026-09-20T10:02:00.000Z',
    }));
    expect(invalidate).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<Monitor>(monitorKeys.detail(MONITOR_A))?.status).toBe('down');
  });

  it('targets incident-open and incident-resolve cache families only', () => {
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderRealtime(queryClient);
    const socket = latestSocket();

    act(() => socket.emitServer('incident.opened', {
      incidentId: INCIDENT_ID,
      monitorId: MONITOR_A,
      status: 'open',
      openedAt: '2026-09-20T10:00:00.000Z',
      triggerReason: 'regional_consensus_failed',
    }));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      monitorIncidentKeys.byMonitor(MONITOR_A),
      monitorMetricKeys.byMonitor(MONITOR_A),
    ]);

    invalidate.mockClear();
    act(() => socket.emitServer('incident.resolved', {
      incidentId: INCIDENT_ID,
      monitorId: MONITOR_A,
      status: 'resolved',
      openedAt: '2026-09-20T10:00:00.000Z',
      resolvedAt: '2026-09-20T10:05:00.000Z',
      durationMs: 300_000,
      triggerReason: 'regional_consensus_failed',
    }));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      incidentKeys.detail(INCIDENT_ID),
      monitorIncidentKeys.byMonitor(MONITOR_A),
      monitorMetricKeys.byMonitor(MONITOR_A),
    ]);
  });

  it('ignores malformed incident events', () => {
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderRealtime(queryClient);

    act(() => latestSocket().emitServer('incident.opened', {
      incidentId: INCIDENT_ID,
      monitorId: MONITOR_A,
      status: 'resolved',
      openedAt: 'not-a-time',
      triggerReason: '',
    }));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('performs a bounded authoritative refresh after reconnect', async () => {
    const queryClient = createQueryClient();
    seedRealtimeQueries(queryClient);
    const activeObserver = new QueryObserver(queryClient, {
      queryKey: monitorMetricKeys.detail(MONITOR_A, RANGE),
      queryFn: () => Promise.resolve({ marker: 'metrics-a' }),
      staleTime: Number.POSITIVE_INFINITY,
    });
    const unsubscribe = activeObserver.subscribe(() => undefined);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    renderRealtime(queryClient);
    const socket = latestSocket();

    act(() => socket.emitServer('connect'));
    socket.active = true;
    act(() => socket.emitServer('disconnect', 'transport close'));
    act(() => socket.emitServer('connect'));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate.mock.calls[0]?.[0]).toMatchObject({ queryKey: monitorKeys.list(), exact: true });
    const predicate = invalidate.mock.calls[1]?.[0]?.predicate;
    if (!predicate) throw new Error('Expected an active-query reconnect predicate');
    const activeMetrics = queryClient.getQueryCache().find({
      queryKey: monitorMetricKeys.detail(MONITOR_A, RANGE),
      exact: true,
    });
    const inactiveMetrics = queryClient.getQueryCache().find({
      queryKey: monitorMetricKeys.detail(MONITOR_B, RANGE),
      exact: true,
    });
    if (!activeMetrics || !inactiveMetrics) throw new Error('Expected seeded metric queries');
    expect(predicate(activeMetrics)).toBe(true);
    expect(predicate(inactiveMetrics)).toBe(false);
    unsubscribe();
  });
});
