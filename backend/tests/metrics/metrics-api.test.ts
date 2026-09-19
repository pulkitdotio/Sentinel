import pino from 'pino';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/api/app';
import { createAccessToken } from '../../src/modules/auth/jwt';
import type {
  CheckHistoryPage,
  CheckHistoryRecord,
  CheckHistoryRequest,
  LatestRegionalCheck,
  MetricsCheckResultRepository,
  OwnedCheckRange,
  RegionalCheckAggregate,
} from '../../src/modules/checks/check-result-repository';
import type {
  IncidentPage,
  IncidentRecord,
  IncidentRepository,
  OpenIncidentInput,
  OpenIncidentResult,
} from '../../src/modules/incidents/incident-repository';
import type {
  CreateMonitorRecord,
  MonitorRecord,
  MonitorRepository,
  UpdateMonitorRecord,
} from '../../src/modules/monitors/monitor-repository';

const SECRET = 'a-test-secret-that-is-long-enough';
const OWNER_ID = '000000000000000000000001';
const OTHER_ID = '000000000000000000000002';
const MONITOR_ID = '000000000000000000000003';
const NOW = new Date('2026-02-01T12:00:00.000Z');

function ownedMonitor(): MonitorRecord {
  return {
    id: MONITOR_ID,
    userId: OWNER_ID,
    name: 'Production API',
    url: 'https://example.com/health',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 500,
    failureThreshold: 2,
    recoveryThreshold: 2,
    regions: ['mumbai', 'singapore'],
    isPaused: false,
    status: 'down',
    nextCheckAt: NOW,
    lastCheckedAt: new Date('2026-02-01T11:00:01.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: NOW,
  };
}

class MetricsMonitorRepository implements MonitorRepository {
  public create(_input: CreateMonitorRecord): Promise<MonitorRecord> {
    return Promise.resolve(ownedMonitor());
  }

  public listByUser(): Promise<MonitorRecord[]> {
    return Promise.resolve([]);
  }

  public findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null> {
    return Promise.resolve(userId === OWNER_ID && monitorId === MONITOR_ID ? ownedMonitor() : null);
  }

  public updateOwnedById(
    _userId: string,
    _monitorId: string,
    _update: UpdateMonitorRecord,
  ): Promise<MonitorRecord | null> {
    return Promise.resolve(null);
  }

  public deleteOwnedById(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

type StoredCheck = CheckHistoryRecord & { userId: string };

function check(
  id: string,
  region: string,
  scheduledAt: string,
  success: boolean,
  latencyMs: number | null,
): StoredCheck {
  const scheduled = new Date(scheduledAt);
  return {
    id,
    userId: OWNER_ID,
    monitorId: MONITOR_ID,
    region,
    scheduledAt: scheduled,
    startedAt: new Date(scheduled.getTime() + 100),
    completedAt: new Date(scheduled.getTime() + 300),
    success,
    statusCode: success ? 200 : 500,
    latencyMs,
    errorType: success ? null : 'unexpected_status',
    ...(success ? {} : { errorMetadata: { code: 'UNEXPECTED_500' } }),
  };
}

class InMemoryMetricsCheckRepository implements MetricsCheckResultRepository {
  public records: StoredCheck[] = [
    check('000000000000000000000011', 'mumbai', '2026-02-01T11:00:00.000Z', true, 100),
    check('000000000000000000000012', 'mumbai', '2026-02-01T10:00:00.000Z', false, 300),
    check('000000000000000000000013', 'legacy-region', '2026-02-01T09:00:00.000Z', true, null),
  ];
  public lastHistoryRequest: CheckHistoryRequest | null = null;
  public metricReadCount = 0;

  private inRange(input: OwnedCheckRange): StoredCheck[] {
    return this.records.filter(
      (record) =>
        record.userId === input.userId &&
        record.monitorId === input.monitorId &&
        record.scheduledAt >= input.from &&
        record.scheduledAt <= input.to,
    );
  }

  public listOwnedHistory(input: CheckHistoryRequest): Promise<CheckHistoryPage> {
    this.lastHistoryRequest = input;
    const matching = this.inRange(input)
      .filter((record) => input.region === undefined || record.region === input.region)
      .sort(
        (left, right) =>
          right.scheduledAt.getTime() - left.scheduledAt.getTime() ||
          right.id.localeCompare(left.id),
      );

    return Promise.resolve({
      checks: matching.slice(input.skip, input.skip + input.limit),
      total: matching.length,
    });
  }

  public summarizeOwnedRange(input: OwnedCheckRange): Promise<RegionalCheckAggregate[]> {
    this.metricReadCount += 1;
    const byRegion = new Map<string, RegionalCheckAggregate>();

    for (const record of this.inRange(input)) {
      const aggregate = byRegion.get(record.region) ?? {
        region: record.region,
        totalChecks: 0,
        successfulChecks: 0,
        latencySampleCount: 0,
        latencyTotalMs: 0,
      };
      aggregate.totalChecks += 1;
      aggregate.successfulChecks += record.success ? 1 : 0;

      if (record.latencyMs !== null) {
        aggregate.latencySampleCount += 1;
        aggregate.latencyTotalMs += record.latencyMs;
      }

      byRegion.set(record.region, aggregate);
    }

    return Promise.resolve([...byRegion.values()]);
  }

  public listOwnedLatencyValues(input: OwnedCheckRange): Promise<number[]> {
    return Promise.resolve(
      this.inRange(input).flatMap((record) =>
        record.latencyMs === null ? [] : [record.latencyMs],
      ),
    );
  }

  public listLatestOwnedByRegions(
    input: OwnedCheckRange,
    regions: readonly string[],
  ): Promise<LatestRegionalCheck[]> {
    const matching = this.inRange(input);

    return Promise.resolve(
      regions.flatMap((region) => {
        const latest = matching
          .filter((record) => record.region === region)
          .sort((left, right) => right.scheduledAt.getTime() - left.scheduledAt.getTime())[0];

        return latest
          ? [
              {
                region: latest.region,
                scheduledAt: latest.scheduledAt,
                success: latest.success,
                statusCode: latest.statusCode,
                latencyMs: latest.latencyMs,
                errorType: latest.errorType,
              },
            ]
          : [];
      }),
    );
  }
}

function incident(index: number): IncidentRecord {
  const openedAt = new Date(NOW.getTime() - index * 60_000);
  return {
    id: (100 + index).toString(16).padStart(24, '0'),
    userId: OWNER_ID,
    monitorId: MONITOR_ID,
    status: 'resolved',
    openedAt,
    resolvedAt: new Date(openedAt.getTime() + 30_000),
    triggerReason: 'regional_failure_consensus',
    openingStatusEvidence: {
      requiredConsensus: 1,
      failureThreshold: 2,
      regions: [{ region: 'mumbai', consecutiveFailures: 2, latestErrorType: 'timeout' }],
    },
    events: [
      { type: 'opened', at: openedAt, message: 'opened' },
      { type: 'resolved', at: new Date(openedAt.getTime() + 30_000), message: 'resolved' },
    ],
    createdAt: openedAt,
    updatedAt: openedAt,
  };
}

class RecentIncidentRepository implements IncidentRepository {
  public lastListRequest: { userId: string; monitorId: string; skip: number; limit: number } | null =
    null;
  public records = Array.from({ length: 6 }, (_, index) => incident(index));

  public findOpenByMonitor(): Promise<IncidentRecord | null> {
    return Promise.resolve(null);
  }

  public openIdempotently(_input: OpenIncidentInput): Promise<OpenIncidentResult> {
    return Promise.resolve({
      incident: this.records[0] as IncidentRecord,
      created: false,
    });
  }

  public resolveIfOpen(): Promise<IncidentRecord | null> {
    return Promise.resolve(null);
  }

  public listOwnedByMonitor(
    userId: string,
    monitorId: string,
    skip: number,
    limit: number,
  ): Promise<IncidentPage> {
    this.lastListRequest = { userId, monitorId, skip, limit };
    const matching = this.records
      .filter((record) => record.userId === userId && record.monitorId === monitorId)
      .sort((left, right) => right.openedAt.getTime() - left.openedAt.getTime());
    return Promise.resolve({ incidents: matching.slice(skip, skip + limit), total: matching.length });
  }

  public findOwnedById(): Promise<IncidentRecord | null> {
    return Promise.resolve(null);
  }
}

function token(userId: string): string {
  return createAccessToken(userId, { secret: SECRET, expiresIn: '7d' });
}

function responseBody(response: Response): unknown {
  return response.body as unknown;
}

describe('Phase 6 historical and metrics API', () => {
  let checks: InMemoryMetricsCheckRepository;
  let incidents: RecentIncidentRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    checks = new InMemoryMetricsCheckRepository();
    incidents = new RecentIncidentRepository();
    app = createApp({
      logger: pino({ enabled: false }),
      isProduction: false,
      clientOrigin: 'http://client.example.com',
      auth: { secret: SECRET, expiresIn: '7d' },
      monitors: {
        enabledRegions: ['mumbai', 'singapore', 'frankfurt'],
        monitorRepository: new MetricsMonitorRepository(),
      },
      incidents: { incidentRepository: incidents },
      metrics: { checkResultRepository: checks, clock: () => NOW },
    });
  });

  it('requires authentication for both Phase 6 endpoints', async () => {
    const history = await request(app).get(`/api/v1/monitors/${MONITOR_ID}/checks`);
    const metrics = await request(app).get(`/api/v1/monitors/${MONITOR_ID}/metrics`);

    expect(history.status).toBe(401);
    expect(metrics.status).toBe(401);
  });

  it('conceals a foreign monitor exactly like a missing monitor', async () => {
    const authorization = `Bearer ${token(OTHER_ID)}`;
    const history = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/checks`)
      .set('Authorization', authorization);
    const metrics = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/metrics`)
      .set('Authorization', authorization);

    expect(history.status).toBe(404);
    expect(metrics.status).toBe(404);
    expect(history.body).toEqual({
      error: { code: 'MONITOR_NOT_FOUND', message: 'Monitor not found' },
    });
    expect(metrics.body).toEqual(history.body);
    expect(checks.metricReadCount).toBe(0);
  });

  it('returns newest-first normalized history with the default range and pagination', async () => {
    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/checks`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      checks: [
        { id: '000000000000000000000011', region: 'mumbai' },
        { id: '000000000000000000000012', region: 'mumbai' },
        { id: '000000000000000000000013', region: 'legacy-region' },
      ],
      range: {
        from: '2026-01-31T12:00:00.000Z',
        to: NOW.toISOString(),
      },
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    });
    expect(checks.lastHistoryRequest).toMatchObject({
      userId: OWNER_ID,
      monitorId: MONITOR_ID,
      skip: 0,
      limit: 50,
    });
    expect(response.text).not.toContain('"userId"');
    expect(response.text).not.toContain('"_id"');
    expect(response.text).not.toContain('"__v"');
  });

  it('applies explicit time and historical region filters', async () => {
    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/checks`)
      .query({
        region: 'legacy-region',
        from: '2026-02-01T08:30:00.000Z',
        to: '2026-02-01T09:30:00.000Z',
      })
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(200);
    const body = responseBody(response) as {
      checks: Array<{ region: string }>;
      range: { from: string; to: string };
    };
    expect(body.checks).toHaveLength(1);
    expect(body.checks[0]).toMatchObject({ region: 'legacy-region' });
    expect(body.range).toEqual({
      from: '2026-02-01T08:30:00.000Z',
      to: '2026-02-01T09:30:00.000Z',
    });
    expect(checks.lastHistoryRequest).toMatchObject({ region: 'legacy-region' });
  });

  it('supports custom pagination and returns a stable empty page', async () => {
    const second = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/checks?page=2&limit=1`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);
    const empty = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/checks?page=5&limit=1`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(second.body).toMatchObject({
      checks: [{ id: '000000000000000000000012' }],
      pagination: { page: 2, limit: 1, total: 3, totalPages: 3 },
    });
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({
      checks: [],
      pagination: { page: 5, limit: 1, total: 3, totalPages: 3 },
    });
  });

  it.each([
    ['malformed timestamp', '?from=not-a-date'],
    [
      'reversed range',
      '?from=2026-02-02T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z',
    ],
    [
      'range over 30 days',
      '?from=2025-12-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z',
    ],
    ['oversized page', '?limit=101'],
    ['unsafe region syntax', '?region=Not_Valid'],
    ['unknown parameter', '?window=24h'],
  ])('rejects %s', async (_caseName, query) => {
    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/checks${query}`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns aggregate, latency, regional, latest-check, and recent-incident metrics', async () => {
    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/metrics`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(200);
    const body = responseBody(response) as {
      regions: Array<{ region: string }>;
      recentIncidents: Array<{ openedAt: string; events?: unknown }>;
    };
    expect(response.body).toMatchObject({
      monitor: {
        id: MONITOR_ID,
        name: 'Production API',
        status: 'down',
        isPaused: false,
        regions: ['mumbai', 'singapore'],
      },
      range: { from: '2026-01-31T12:00:00.000Z', to: NOW.toISOString() },
      totals: { checks: 3, successfulChecks: 2, failedChecks: 1 },
      uptimePercentage: 66.67,
      latency: { sampleCount: 2, averageMs: 200, p50Ms: 100, p95Ms: 300, p99Ms: 300 },
      regions: [
        {
          region: 'mumbai',
          totalChecks: 2,
          successfulChecks: 1,
          failedChecks: 1,
          uptimePercentage: 50,
          averageLatencyMs: 200,
          latestCheck: {
            scheduledAt: '2026-02-01T11:00:00.000Z',
            success: true,
          },
        },
        {
          region: 'singapore',
          totalChecks: 0,
          successfulChecks: 0,
          failedChecks: 0,
          uptimePercentage: null,
          averageLatencyMs: null,
          latestCheck: null,
        },
      ],
    });
    expect(body.regions).toHaveLength(2);
    expect(body.regions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ region: 'legacy-region' })]),
    );
    expect(body.recentIncidents).toHaveLength(5);
    expect(body.recentIncidents[0]?.openedAt).toBe(NOW.toISOString());
    expect(body.recentIncidents[0]).not.toHaveProperty('events');
    expect(incidents.lastListRequest).toEqual({
      userId: OWNER_ID,
      monitorId: MONITOR_ID,
      skip: 0,
      limit: 5,
    });
  });

  it('includes a failed check with measured latency and excludes null latency', async () => {
    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/metrics`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    const body = responseBody(response) as { latency: Record<string, unknown> };
    expect(body.latency).toEqual({
      sampleCount: 2,
      averageMs: 200,
      p50Ms: 100,
      p95Ms: 300,
      p99Ms: 300,
    });
  });

  it('returns stable metrics for a monitor with no data', async () => {
    checks.records = [];
    incidents.records = [];

    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/metrics`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      totals: { checks: 0, successfulChecks: 0, failedChecks: 0 },
      uptimePercentage: null,
      latency: {
        sampleCount: 0,
        averageMs: null,
        p50Ms: null,
        p95Ms: null,
        p99Ms: null,
      },
      regions: [
        { region: 'mumbai', totalChecks: 0, uptimePercentage: null, latestCheck: null },
        { region: 'singapore', totalChecks: 0, uptimePercentage: null, latestCheck: null },
      ],
      recentIncidents: [],
    });
    expect(response.text).not.toContain('NaN');
    expect(response.text).not.toContain('Infinity');
  });

  it('returns the normalized explicit range from the metrics endpoint', async () => {
    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/metrics`)
      .query({ from: '2026-02-01T14:30:00+05:30', to: '2026-02-01T16:30:00+05:30' })
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(200);
    const body = responseBody(response) as { range: { from: string; to: string } };
    expect(body.range).toEqual({
      from: '2026-02-01T09:00:00.000Z',
      to: '2026-02-01T11:00:00.000Z',
    });
  });
});
