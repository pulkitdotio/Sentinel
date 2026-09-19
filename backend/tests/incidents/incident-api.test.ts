import pino from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/api/app';
import { createAccessToken } from '../../src/modules/auth/jwt';
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
const INCIDENT_ID = '000000000000000000000004';
const OPENED_AT = new Date('2026-01-01T00:00:00.000Z');

function monitor(): MonitorRecord {
  return {
    id: MONITOR_ID,
    userId: OWNER_ID,
    name: 'API',
    url: 'https://example.com/',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 500,
    failureThreshold: 2,
    recoveryThreshold: 2,
    regions: ['mumbai'],
    isPaused: false,
    status: 'healthy',
    nextCheckAt: OPENED_AT,
    lastCheckedAt: OPENED_AT,
    createdAt: OPENED_AT,
    updatedAt: OPENED_AT,
  };
}

function incident(): IncidentRecord {
  return {
    id: INCIDENT_ID,
    userId: OWNER_ID,
    monitorId: MONITOR_ID,
    status: 'resolved',
    openedAt: OPENED_AT,
    resolvedAt: new Date('2026-01-01T00:05:00.000Z'),
    triggerReason: 'regional_failure_consensus',
    openingStatusEvidence: {
      requiredConsensus: 1,
      failureThreshold: 2,
      regions: [
        {
          region: 'mumbai',
          consecutiveFailures: 2,
          latestErrorType: 'timeout',
        },
      ],
    },
    events: [
      { type: 'opened', at: OPENED_AT, message: 'opened' },
      {
        type: 'resolved',
        at: new Date('2026-01-01T00:05:00.000Z'),
        message: 'resolved',
      },
    ],
    createdAt: OPENED_AT,
    updatedAt: new Date('2026-01-01T00:05:00.000Z'),
  };
}

class OwnershipMonitorRepository implements MonitorRepository {
  public create(_input: CreateMonitorRecord): Promise<MonitorRecord> {
    return Promise.resolve(monitor());
  }

  public listByUser(): Promise<MonitorRecord[]> {
    return Promise.resolve([]);
  }

  public findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null> {
    return Promise.resolve(userId === OWNER_ID && monitorId === MONITOR_ID ? monitor() : null);
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

class QueryIncidentRepository implements IncidentRepository {
  public lastPageRequest: { skip: number; limit: number } | null = null;

  public findOpenByMonitor(): Promise<IncidentRecord | null> {
    return Promise.resolve(null);
  }

  public openIdempotently(_input: OpenIncidentInput): Promise<OpenIncidentResult> {
    return Promise.resolve({ incident: incident(), created: false });
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
    this.lastPageRequest = { skip, limit };
    return Promise.resolve({
      incidents: userId === OWNER_ID && monitorId === MONITOR_ID ? [incident()] : [],
      total: 41,
    });
  }

  public findOwnedById(userId: string, incidentId: string): Promise<IncidentRecord | null> {
    return Promise.resolve(userId === OWNER_ID && incidentId === INCIDENT_ID ? incident() : null);
  }
}

function token(userId: string): string {
  return createAccessToken(userId, { secret: SECRET, expiresIn: '7d' });
}

describe('incident query API', () => {
  let repository: QueryIncidentRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repository = new QueryIncidentRepository();
    app = createApp({
      logger: pino({ enabled: false }),
      isProduction: false,
      clientOrigin: 'http://client.example.com',
      auth: { secret: SECRET, expiresIn: '7d' },
      monitors: {
        enabledRegions: ['mumbai'],
        monitorRepository: new OwnershipMonitorRepository(),
      },
      incidents: { incidentRepository: repository },
    });
  });

  it('requires authentication for incident history and detail', async () => {
    const history = await request(app).get(`/api/v1/monitors/${MONITOR_ID}/incidents`);
    const detail = await request(app).get(`/api/v1/incidents/${INCIDENT_ID}`);

    expect(history.status).toBe(401);
    expect(detail.status).toBe(401);
  });

  it('returns owned paginated incident history with bounded paging metadata', async () => {
    const response = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/incidents?page=2&limit=20`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      incidents: [
        {
          id: INCIDENT_ID,
          monitorId: MONITOR_ID,
          events: [{ type: 'opened' }, { type: 'resolved' }],
        },
      ],
      pagination: { page: 2, limit: 20, total: 41, totalPages: 3 },
    });
    expect(repository.lastPageRequest).toEqual({ skip: 20, limit: 20 });
  });

  it('conceals another user monitor and incident ownership', async () => {
    const authorization = `Bearer ${token(OTHER_ID)}`;
    const history = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/incidents`)
      .set('Authorization', authorization);
    const detail = await request(app)
      .get(`/api/v1/incidents/${INCIDENT_ID}`)
      .set('Authorization', authorization);

    expect(history.status).toBe(404);
    expect(history.body).toEqual({
      error: { code: 'MONITOR_NOT_FOUND', message: 'Monitor not found' },
    });
    expect(detail.status).toBe(404);
    expect(detail.body).toEqual({
      error: { code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' },
    });
  });

  it('validates identifiers and the maximum page size', async () => {
    const authorization = `Bearer ${token(OWNER_ID)}`;
    const malformedId = await request(app)
      .get('/api/v1/incidents/not-an-id')
      .set('Authorization', authorization);
    const oversizedPage = await request(app)
      .get(`/api/v1/monitors/${MONITOR_ID}/incidents?limit=101`)
      .set('Authorization', authorization);

    expect(malformedId.status).toBe(400);
    expect(oversizedPage.status).toBe(400);
    expect(malformedId.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(oversizedPage.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns an owned incident with its bounded event timeline', async () => {
    const response = await request(app)
      .get(`/api/v1/incidents/${INCIDENT_ID}`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      incident: {
        id: INCIDENT_ID,
        status: 'resolved',
        events: [{ type: 'opened' }, { type: 'resolved' }],
      },
    });
    expect(response.text).not.toContain('"_id"');
    expect(response.text).not.toContain('"__v"');
  });

  it('does not expose manual incident mutation endpoints', async () => {
    const response = await request(app)
      .post(`/api/v1/incidents/${INCIDENT_ID}/resolve`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
  });
});
