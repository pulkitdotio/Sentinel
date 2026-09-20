import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_TOKEN_STORAGE_KEY } from '../auth/auth-token';
import type { AiFailureCode } from '../features/ai/api/ai-contracts';
import type { Incident } from '../features/incidents/api/incident-contracts';
import type { MonitorMetrics } from '../features/metrics/api/metric-contracts';
import type { Monitor } from '../features/monitors/api/monitor-contracts';
import { getFakeSocketCreations } from '../test/fake-socket-io-client';
import { App } from './App';

const MONITOR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const INCIDENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ANALYSIS_ID = 'cccccccccccccccccccccccc';
const SECOND_ANALYSIS_ID = 'dddddddddddddddddddddddd';
const NOW = '2026-09-20T12:00:00.000Z';
const EARLIER = '2026-09-19T12:00:00.000Z';

const authenticatedUser = {
  id: 'user-1', name: 'Pulkit', email: 'pulkit@example.com',
  createdAt: EARLIER, updatedAt: NOW,
};

const currentMonitor: Monitor = {
  id: MONITOR_ID, userId: authenticatedUser.id, name: 'Production API', url: 'https://api.example.com/health', method: 'GET',
  intervalSeconds: 60, timeoutMs: 5_000, expectedStatusCodes: [200], latencyThresholdMs: 800,
  failureThreshold: 3, recoveryThreshold: 2, regions: ['mumbai', 'singapore'], isPaused: false,
  status: 'healthy', nextCheckAt: NOW, lastCheckedAt: NOW, createdAt: EARLIER, updatedAt: NOW,
};

const currentMetrics: MonitorMetrics = {
  monitor: { id: MONITOR_ID, name: currentMonitor.name, status: 'healthy', isPaused: false, lastCheckedAt: NOW, regions: currentMonitor.regions },
  range: { from: EARLIER, to: NOW },
  totals: { checks: 120, successfulChecks: 119, failedChecks: 1 },
  uptimePercentage: 99.17,
  latency: { sampleCount: 120, averageMs: 145, p50Ms: 130, p95Ms: 220, p99Ms: 350 },
  regions: currentMonitor.regions.map((region) => ({
    region, totalChecks: 60, successfulChecks: region === 'mumbai' ? 59 : 60, failedChecks: region === 'mumbai' ? 1 : 0,
    uptimePercentage: region === 'mumbai' ? 98.33 : 100, averageLatencyMs: 145,
    latestCheck: { scheduledAt: NOW, success: true, statusCode: 200, latencyMs: 140, errorType: null },
  })),
  recentIncidents: [],
};

function incident(status: 'open' | 'resolved' = 'resolved'): Incident {
  return {
    id: INCIDENT_ID, userId: authenticatedUser.id, monitorId: MONITOR_ID, status, openedAt: EARLIER,
    resolvedAt: status === 'resolved' ? NOW : null, triggerReason: 'Regional failure consensus',
    openingStatusEvidence: { requiredConsensus: 2, failureThreshold: 3, regions: [
      { region: 'mumbai', consecutiveFailures: 3, latestErrorType: 'timeout' },
      { region: 'singapore', consecutiveFailures: 3, latestErrorType: 'connection' },
    ] },
    events: status === 'resolved' ? [
      { type: 'opened', at: EARLIER, message: 'Incident opened' },
      { type: 'resolved', at: NOW, message: 'Incident resolved' },
    ] : [{ type: 'opened', at: EARLIER, message: 'Incident opened' }],
    createdAt: EARLIER, updatedAt: NOW,
  };
}

const monitorResult = {
  summary: 'Availability was stable across the selected window.',
  observations: ['119 of 120 checks succeeded.'],
  regionalFindings: ['Mumbai recorded one isolated failure.'],
  latencyFindings: ['P95 latency remained below the configured threshold.'],
  reliabilityRisk: 'medium' as const,
  caveats: ['This is an advisory assessment based only on Sentinel telemetry.'],
};

const incidentResult = {
  summary: 'The resolved incident affected two regions.',
  timelineSummary: 'Regional failures reached consensus and later recovered.',
  affectedRegions: ['mumbai', 'singapore'],
  likelyPattern: 'The evidence is consistent with a shared upstream interruption.',
  evidence: ['Both regions crossed the failure threshold.'],
  caveats: ['The available telemetry does not confirm a root cause.'],
};

function monitorAnalysis(status: 'queued' | 'processing' | 'completed' | 'failed', overrides: Record<string, unknown> = {}) {
  return {
    id: ANALYSIS_ID, type: 'monitor_health', monitorId: MONITOR_ID, incidentId: null, status,
    inputWindow: { from: EARLIER, to: NOW },
    result: status === 'completed' ? monitorResult : null,
    failureCode: status === 'failed' ? 'AI_PROVIDER_ERROR' : null,
    createdAt: NOW, updatedAt: NOW,
    completedAt: status === 'completed' || status === 'failed' ? NOW : null,
    ...overrides,
  };
}

function incidentAnalysis(status: 'queued' | 'processing' | 'completed' | 'failed', overrides: Record<string, unknown> = {}) {
  return {
    id: ANALYSIS_ID, type: 'incident_summary', monitorId: MONITOR_ID, incidentId: INCIDENT_ID, status,
    inputWindow: { from: EARLIER, to: NOW },
    result: status === 'completed' ? incidentResult : null,
    failureCode: status === 'failed' ? 'AI_PROVIDER_ERROR' : null,
    createdAt: NOW, updatedAt: NOW,
    completedAt: status === 'completed' || status === 'failed' ? NOW : null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestBody(init?: RequestInit): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
}

type ApiHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const fetchMock = vi.fn<typeof fetch>();

function mockApi(handler: ApiHandler): void {
  fetchMock.mockImplementation(async (input, init) => {
    const url = requestUrl(input);
    if (url.endsWith('/api/v1/auth/me')) return jsonResponse({ user: authenticatedUser });
    if (url.endsWith(`/api/v1/monitors/${MONITOR_ID}`)) return jsonResponse({ monitor: currentMonitor });
    if (url.includes(`/api/v1/monitors/${MONITOR_ID}/metrics?`)) return jsonResponse(currentMetrics);
    if (url.includes(`/api/v1/monitors/${MONITOR_ID}/checks?`)) return jsonResponse({
      checks: [], range: { from: EARLIER, to: NOW }, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    return handler(url, init);
  });
}

function renderAuthenticated(path: string): void {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'valid-token');
  window.history.pushState({}, '', path);
  render(<App />);
}

function aiPostCalls() {
  return fetchMock.mock.calls.filter(([input, init]) => init?.method === 'POST' && /ai-insights|ai-summary/.test(requestUrl(input)));
}

describe('bounded AI monitor insight', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    window.history.pushState({}, '', '/');
  });

  it('does not request AI on render and keeps a separate 24-hour default', async () => {
    mockApi((url) => { throw new Error(`Unexpected request: ${url}`); });
    renderAuthenticated(`/app/monitors/${MONITOR_ID}`);

    expect(await screen.findByRole('heading', { name: 'Understand recent monitor health' })).toBeInTheDocument();
    expect(screen.getByLabelText('AI analysis window')).toHaveValue('24');
    expect(aiPostCalls()).toHaveLength(0);
  });

  it.each([
    ['6 hours', 6],
    ['24 hours', 24],
    ['72 hours', 72],
    ['7 days', 168],
  ])('sends the exact bounded %s lookback', async (label, hours) => {
    const queued = monitorAnalysis('queued');
    mockApi((url, init) => {
      if (url.endsWith('/ai-insights') && init?.method === 'POST') return jsonResponse({ analysis: queued }, 202);
      if (url.endsWith(`/ai-analyses/${ANALYSIS_ID}`)) return jsonResponse({ analysis: queued });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/monitors/${MONITOR_ID}`);
    await screen.findByRole('heading', { name: 'Understand recent monitor health' });
    await userEvent.selectOptions(screen.getByLabelText('AI analysis window'), String(hours));
    await userEvent.click(screen.getByRole('button', { name: 'Generate insight' }));

    await screen.findByText('Analysis queued');
    expect(requestBody(aiPostCalls()[0]?.[1])).toEqual({ lookbackHours: hours });
  });

  it('shows processing, renders a completed structured result, and permits explicit regeneration', async () => {
    let postCount = 0;
    let resolveAnalysis: ((response: Response) => void) | undefined;
    const pendingAnalysis = new Promise<Response>((resolve) => { resolveAnalysis = resolve; });
    const processing = monitorAnalysis('processing');
    const completed = monitorAnalysis('completed');
    mockApi((url, init) => {
      if (url.endsWith('/ai-insights') && init?.method === 'POST') {
        postCount += 1;
        return jsonResponse({ analysis: postCount === 1 ? processing : { ...completed, id: SECOND_ANALYSIS_ID } }, 202);
      }
      if (url.endsWith(`/ai-analyses/${ANALYSIS_ID}`)) return pendingAnalysis;
      if (url.endsWith(`/ai-analyses/${SECOND_ANALYSIS_ID}`)) return jsonResponse({ analysis: { ...completed, id: SECOND_ANALYSIS_ID } });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/monitors/${MONITOR_ID}`);
    await screen.findByRole('heading', { name: 'Understand recent monitor health' });
    await userEvent.click(screen.getByRole('button', { name: 'Generate insight' }));

    expect(await screen.findByText('Analyzing Sentinel evidence…')).toBeInTheDocument();
    act(() => resolveAnalysis?.(jsonResponse({ analysis: completed })));
    expect(await screen.findByText(monitorResult.summary)).toBeInTheDocument();
    expect(screen.getByText(monitorResult.observations[0]!)).toBeInTheDocument();
    expect(screen.getByText(monitorResult.regionalFindings[0]!)).toBeInTheDocument();
    expect(screen.getByText(monitorResult.latencyFindings[0]!)).toBeInTheDocument();
    expect(screen.getByText(/AI risk assessment:/)).toHaveTextContent('Medium');
    expect(screen.getByText(monitorResult.caveats[0]!)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Generate new insight' }));
    await waitFor(() => expect(aiPostCalls()).toHaveLength(2));
  });

  it('renders generated text as text rather than executable HTML', async () => {
    const unsafeText = '<img src=x onerror="alert(1)">';
    const completed = monitorAnalysis('completed', { result: { ...monitorResult, summary: unsafeText } });
    mockApi((url, init) => {
      if (url.endsWith('/ai-insights') && init?.method === 'POST') return jsonResponse({ analysis: completed }, 202);
      if (url.endsWith(`/ai-analyses/${ANALYSIS_ID}`)) return jsonResponse({ analysis: completed });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/monitors/${MONITOR_ID}`);
    await screen.findByRole('heading', { name: 'Understand recent monitor health' });
    await userEvent.click(screen.getByRole('button', { name: 'Generate insight' }));
    expect(await screen.findByText(unsafeText)).toBeInTheDocument();
    expect(document.querySelector('.ai-result img')).toBeNull();
  });
});

describe('bounded incident summary', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    window.history.pushState({}, '', '/');
  });

  it('keeps generation unavailable for an open incident and never posts', async () => {
    mockApi((url) => {
      if (url.endsWith(`/api/v1/incidents/${INCIDENT_ID}`)) return jsonResponse({ incident: incident('open') });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/incidents/${INCIDENT_ID}`);

    expect(await screen.findByText('AI summaries become available after the incident is resolved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate summary' })).toBeDisabled();
    expect(aiPostCalls()).toHaveLength(0);
  });

  it('posts only on request and renders the completed incident result with cautious wording', async () => {
    const completed = incidentAnalysis('completed');
    mockApi((url, init) => {
      if (url.endsWith(`/api/v1/incidents/${INCIDENT_ID}`) && init?.method !== 'POST') return jsonResponse({ incident: incident() });
      if (url.endsWith('/ai-summary') && init?.method === 'POST') return jsonResponse({ analysis: completed }, 202);
      if (url.endsWith(`/ai-analyses/${ANALYSIS_ID}`)) return jsonResponse({ analysis: completed });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/incidents/${INCIDENT_ID}`);
    expect(await screen.findByRole('heading', { name: 'Summarize this incident' })).toBeInTheDocument();
    expect(aiPostCalls()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Generate summary' }));
    expect(await screen.findByText(incidentResult.summary)).toBeInTheDocument();
    expect(screen.getByText(incidentResult.timelineSummary)).toBeInTheDocument();
    expect(screen.getAllByText('Mumbai').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Singapore').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('heading', { name: 'Likely pattern' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /root cause/i })).not.toBeInTheDocument();
    expect(screen.getByText(incidentResult.evidence[0]!)).toBeInTheDocument();
    expect(screen.getByText(incidentResult.caveats[0]!)).toBeInTheDocument();

    const post = aiPostCalls()[0];
    expect(post).toBeDefined();
    expect(requestUrl(post![0])).toMatch(new RegExp(`/api/v1/incidents/${INCIDENT_ID}/ai-summary$`));
    expect(post?.[1]?.body).toBeUndefined();
  });
});

describe('safe AI failure presentation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    window.history.pushState({}, '', '/');
  });

  it.each([
    ['AI_FEATURE_DISABLED', 503, 'AI analysis is disabled for this Sentinel environment.'],
    ['AI_QUEUE_PUBLISH_FAILED', 503, 'Sentinel could not queue the analysis. Try again shortly.'],
  ])('maps request error %s to dedicated monitor copy', async (code, status, message) => {
    mockApi((url, init) => {
      if (url.endsWith('/ai-insights') && init?.method === 'POST') return jsonResponse({ error: { code, message: 'backend text' } }, status);
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/monitors/${MONITOR_ID}`);
    await screen.findByRole('heading', { name: 'Understand recent monitor health' });
    await userEvent.click(screen.getByRole('button', { name: 'Generate insight' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('maps INCIDENT_NOT_RESOLVED without exposing a generic crash', async () => {
    mockApi((url, init) => {
      if (url.endsWith(`/api/v1/incidents/${INCIDENT_ID}`) && init?.method !== 'POST') return jsonResponse({ incident: incident() });
      if (url.endsWith('/ai-summary') && init?.method === 'POST') return jsonResponse({ error: { code: 'INCIDENT_NOT_RESOLVED', message: 'backend text' } }, 409);
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/incidents/${INCIDENT_ID}`);
    await screen.findByRole('heading', { name: 'Summarize this incident' });
    await userEvent.click(screen.getByRole('button', { name: 'Generate summary' }));
    expect(await screen.findByText('This incident must be resolved before it can be summarized.')).toBeInTheDocument();
  });

  it.each([
    ['AI_PROVIDER_TIMEOUT', 'The AI provider timed out.'],
    ['AI_PROVIDER_RATE_LIMITED', 'The AI provider is temporarily rate-limited.'],
    ['AI_INVALID_OUTPUT', 'The generated analysis could not be validated safely.'],
  ] satisfies Array<[AiFailureCode, string]>)('maps terminal failure %s safely', async (failureCode, message) => {
    const failed = monitorAnalysis('failed', { failureCode });
    mockApi((url, init) => {
      if (url.endsWith('/ai-insights') && init?.method === 'POST') return jsonResponse({ analysis: failed }, 202);
      if (url.endsWith(`/ai-analyses/${ANALYSIS_ID}`)) return jsonResponse({ analysis: failed });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderAuthenticated(`/app/monitors/${MONITOR_ID}`);
    await screen.findByRole('heading', { name: 'Understand recent monitor health' });
    await userEvent.click(screen.getByRole('button', { name: 'Generate insight' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('AI generation isolation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    window.history.pushState({}, '', '/');
  });

  it('does not create AI work for monitoring events or reconnects', async () => {
    mockApi((url) => { throw new Error(`Unexpected request: ${url}`); });
    renderAuthenticated(`/app/monitors/${MONITOR_ID}`);
    await screen.findByRole('heading', { name: 'Understand recent monitor health' });
    const socket = getFakeSocketCreations().at(-1)?.socket;
    if (!socket) throw new Error('Expected authenticated socket');

    act(() => {
      socket.emitServer('check.completed', {
        checkResultId: 'eeeeeeeeeeeeeeeeeeeeeeee', monitorId: MONITOR_ID, region: 'mumbai',
        scheduledAt: NOW, success: true, statusCode: 200, latencyMs: 120, errorType: null,
      });
      socket.emitServer('incident.opened', {
        incidentId: INCIDENT_ID, monitorId: MONITOR_ID, status: 'open', openedAt: NOW,
        triggerReason: 'regional_consensus_failed',
      });
      socket.emitServer('monitor.status_changed', {
        monitorId: MONITOR_ID, previousStatus: 'healthy', status: 'degraded', changedAt: NOW,
      });
      socket.emitServer('incident.resolved', {
        incidentId: INCIDENT_ID, monitorId: MONITOR_ID, status: 'resolved', openedAt: EARLIER,
        resolvedAt: NOW, durationMs: 86_400_000, triggerReason: 'regional_consensus_failed',
      });
      socket.emitServer('connect');
      socket.active = true;
      socket.emitServer('disconnect', 'transport close');
      socket.emitServer('connect');
    });

    expect(aiPostCalls()).toHaveLength(0);
  });
});
