import pino from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/api/app';
import type {
  AiAnalysisRecord,
  AiAnalysisRepository,
  CreateAiAnalysisRecord,
} from '../../src/modules/ai/ai-analysis-repository';
import type { AiAnalysisStatus, AiFailureCode } from '../../src/modules/ai/ai-contracts';
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
import type { AiAnalysisJobPublisher } from '../../src/queues/ai-analysis-publisher';
import { createAiAnalysisJobId } from '../../src/queues/jobs/ai-analysis';

const SECRET = 'a-test-secret-that-is-long-enough';
const OWNER_ID = '000000000000000000000001';
const OTHER_ID = '000000000000000000000002';
const MONITOR_ID = '000000000000000000000003';
const INCIDENT_ID = '000000000000000000000004';
const ANALYSIS_ID = '000000000000000000000005';
const NOW = new Date('2026-09-19T12:00:00.000Z');

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
    nextCheckAt: NOW,
    lastCheckedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function incident(status: 'open' | 'resolved' = 'resolved'): IncidentRecord {
  const resolvedAt = status === 'resolved' ? NOW : null;
  return {
    id: INCIDENT_ID,
    userId: OWNER_ID,
    monitorId: MONITOR_ID,
    status,
    openedAt: new Date(NOW.getTime() - 300_000),
    resolvedAt,
    triggerReason: 'regional_failure_consensus',
    openingStatusEvidence: {
      requiredConsensus: 1,
      failureThreshold: 2,
      regions: [{ region: 'mumbai', consecutiveFailures: 2, latestErrorType: 'timeout' }],
    },
    events: [{ type: 'opened', at: new Date(NOW.getTime() - 300_000), message: 'opened' }],
    createdAt: new Date(NOW.getTime() - 300_000),
    updatedAt: NOW,
  };
}

class AiMonitorRepository implements MonitorRepository {
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

class AiIncidentRepository implements IncidentRepository {
  public record: IncidentRecord = incident();

  public findOpenByMonitor(): Promise<IncidentRecord | null> {
    return Promise.resolve(null);
  }

  public openIdempotently(_input: OpenIncidentInput): Promise<OpenIncidentResult> {
    return Promise.resolve({ incident: this.record, created: false });
  }

  public resolveIfOpen(): Promise<IncidentRecord | null> {
    return Promise.resolve(null);
  }

  public listOwnedByMonitor(): Promise<IncidentPage> {
    return Promise.resolve({ incidents: [], total: 0 });
  }

  public findOwnedById(userId: string, incidentId: string): Promise<IncidentRecord | null> {
    return Promise.resolve(
      userId === OWNER_ID && incidentId === INCIDENT_ID ? this.record : null,
    );
  }
}

class MemoryAnalysisRepository implements AiAnalysisRepository {
  public records = new Map<string, AiAnalysisRecord>();
  public createCount = 0;

  public createQueued(input: CreateAiAnalysisRecord): Promise<AiAnalysisRecord> {
    this.createCount += 1;
    const record: AiAnalysisRecord = {
      id: ANALYSIS_ID,
      ...input,
      status: 'queued',
      result: null,
      failureCode: null,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
    };
    this.records.set(record.id, record);
    return Promise.resolve(record);
  }

  public findById(analysisId: string): Promise<AiAnalysisRecord | null> {
    return Promise.resolve(this.records.get(analysisId) ?? null);
  }

  public findOwnedById(userId: string, analysisId: string): Promise<AiAnalysisRecord | null> {
    const record = this.records.get(analysisId);
    return Promise.resolve(record?.userId === userId ? record : null);
  }

  public markProcessing(): Promise<AiAnalysisRecord | null> {
    return Promise.resolve(null);
  }

  public completeIfProcessing(): Promise<AiAnalysisRecord | null> {
    return Promise.resolve(null);
  }

  public failIfActive(
    analysisId: string,
    failureCode: AiFailureCode,
    completedAt: Date,
  ): Promise<AiAnalysisRecord | null> {
    const current = this.records.get(analysisId);

    if (!current || (current.status !== 'queued' && current.status !== 'processing')) {
      return Promise.resolve(null);
    }

    const failed = {
      ...current,
      status: 'failed' as const,
      result: null,
      failureCode,
      completedAt,
      updatedAt: completedAt,
    };
    this.records.set(analysisId, failed);
    return Promise.resolve(failed);
  }
}

class RecordingPublisher implements AiAnalysisJobPublisher {
  public payloads: Array<{ analysisId: string }> = [];
  public shouldFail = false;

  public enqueue(payload: { analysisId: string }): Promise<{ jobId: string }> {
    this.payloads.push(payload);

    if (this.shouldFail) {
      return Promise.reject(new Error('redis unavailable'));
    }

    return Promise.resolve({ jobId: createAiAnalysisJobId(payload) });
  }
}

function token(userId: string): string {
  return createAccessToken(userId, { secret: SECRET, expiresIn: '7d' });
}

describe('Phase 8 AI API', () => {
  let analyses: MemoryAnalysisRepository;
  let incidents: AiIncidentRepository;
  let publisher: RecordingPublisher;

  function app(enabled = true): ReturnType<typeof createApp> {
    return createApp({
      logger: pino({ enabled: false }),
      isProduction: false,
      clientOrigin: 'http://client.example.com',
      auth: { secret: SECRET, expiresIn: '7d' },
      monitors: { enabledRegions: ['mumbai'], monitorRepository: new AiMonitorRepository() },
      incidents: { incidentRepository: incidents },
      ai: {
        enabled,
        analysisRepository: analyses,
        queuePublisher: publisher,
        clock: () => NOW,
      },
    });
  }

  beforeEach(() => {
    analyses = new MemoryAnalysisRepository();
    incidents = new AiIncidentRepository();
    publisher = new RecordingPublisher();
  });

  it('requires authentication for both request endpoints and analysis lookup', async () => {
    const api = app();
    const responses = await Promise.all([
      request(api).post(`/api/v1/monitors/${MONITOR_ID}/ai-insights`).send({}),
      request(api).post(`/api/v1/incidents/${INCIDENT_ID}/ai-summary`).send({}),
      request(api).get(`/api/v1/ai-analyses/${ANALYSIS_ID}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
  });

  it('disables both creation endpoints without creating or enqueueing work', async () => {
    const api = app(false);
    const authorization = `Bearer ${token(OWNER_ID)}`;
    const monitorResponse = await request(api)
      .post(`/api/v1/monitors/${MONITOR_ID}/ai-insights`)
      .set('Authorization', authorization)
      .send({});
    const incidentResponse = await request(api)
      .post(`/api/v1/incidents/${INCIDENT_ID}/ai-summary`)
      .set('Authorization', authorization)
      .send({});

    expect(monitorResponse.status).toBe(503);
    expect(incidentResponse.status).toBe(503);
    expect(monitorResponse.body).toEqual({
      error: { code: 'AI_FEATURE_DISABLED', message: 'AI analysis is disabled' },
    });
    expect(incidentResponse.body).toEqual(monitorResponse.body);
    expect(analyses.createCount).toBe(0);
    expect(publisher.payloads).toEqual([]);
  });

  it('creates a queued monitor analysis with the default 24-hour window and ID-only job', async () => {
    const response = await request(app())
      .post(`/api/v1/monitors/${MONITOR_ID}/ai-insights`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`)
      .send({});

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      analysis: {
        id: ANALYSIS_ID,
        type: 'monitor_health',
        monitorId: MONITOR_ID,
        incidentId: null,
        status: 'queued',
        inputWindow: {
          from: '2026-09-18T12:00:00.000Z',
          to: NOW.toISOString(),
        },
      },
    });
    expect(publisher.payloads).toEqual([{ analysisId: ANALYSIS_ID }]);
    expect(createAiAnalysisJobId(publisher.payloads[0] as { analysisId: string })).toBe(
      `ai-analysis-${ANALYSIS_ID}`,
    );
  });

  it.each([
    [1, '2026-09-19T11:00:00.000Z'],
    [168, '2026-09-12T12:00:00.000Z'],
  ])('accepts the %i-hour lookback boundary', async (lookbackHours, expectedFrom) => {
    const response = await request(app())
      .post(`/api/v1/monitors/${MONITOR_ID}/ai-insights`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`)
      .send({ lookbackHours });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ analysis: { inputWindow: { from: expectedFrom } } });
  });

  it.each([0, 169, 1.5])('rejects invalid lookback %s', async (lookbackHours) => {
    const response = await request(app())
      .post(`/api/v1/monitors/${MONITOR_ID}/ai-insights`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`)
      .send({ lookbackHours });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(analyses.createCount).toBe(0);
  });

  it('conceals foreign monitors and incidents', async () => {
    const authorization = `Bearer ${token(OTHER_ID)}`;
    const monitorResponse = await request(app())
      .post(`/api/v1/monitors/${MONITOR_ID}/ai-insights`)
      .set('Authorization', authorization)
      .send({});
    const incidentResponse = await request(app())
      .post(`/api/v1/incidents/${INCIDENT_ID}/ai-summary`)
      .set('Authorization', authorization)
      .send({});

    expect(monitorResponse.status).toBe(404);
    expect(incidentResponse.status).toBe(404);
    expect(analyses.createCount).toBe(0);
  });

  it('queues a resolved incident summary and rejects an open incident', async () => {
    const authorization = `Bearer ${token(OWNER_ID)}`;
    const resolved = await request(app())
      .post(`/api/v1/incidents/${INCIDENT_ID}/ai-summary`)
      .set('Authorization', authorization)
      .send({});

    expect(resolved.status).toBe(202);
    expect(resolved.body).toMatchObject({
      analysis: {
        type: 'incident_summary',
        monitorId: MONITOR_ID,
        incidentId: INCIDENT_ID,
        status: 'queued',
      },
    });

    analyses = new MemoryAnalysisRepository();
    incidents.record = incident('open');
    const open = await request(app())
      .post(`/api/v1/incidents/${INCIDENT_ID}/ai-summary`)
      .set('Authorization', authorization)
      .send({});
    expect(open.status).toBe(409);
    expect(open.body).toEqual({
      error: { code: 'INCIDENT_NOT_RESOLVED', message: 'Incident is not resolved' },
    });
    expect(analyses.createCount).toBe(0);
  });

  it.each(['queued', 'processing', 'completed', 'failed'] as const)(
    'returns a safe owner-scoped %s analysis DTO',
    async (status: AiAnalysisStatus) => {
      const record = await analyses.createQueued({
        userId: OWNER_ID,
        type: 'monitor_health',
        monitorId: MONITOR_ID,
        incidentId: null,
        inputWindow: { from: new Date(NOW.getTime() - 3_600_000), to: NOW },
      });
      analyses.records.set(record.id, {
        ...record,
        status,
        failureCode: status === 'failed' ? 'AI_PROVIDER_ERROR' : null,
        completedAt: status === 'completed' || status === 'failed' ? NOW : null,
      });

      const response = await request(app())
        .get(`/api/v1/ai-analyses/${ANALYSIS_ID}`)
        .set('Authorization', `Bearer ${token(OWNER_ID)}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ analysis: { id: ANALYSIS_ID, status } });
      expect(response.text).not.toContain('userId');
      expect(response.text).not.toContain('provider');
      expect(response.text).not.toContain('prompt');
      expect(response.text).not.toContain('_id');
      expect(response.text).not.toContain('__v');
    },
  );

  it('conceals a foreign analysis exactly like a missing analysis', async () => {
    await analyses.createQueued({
      userId: OWNER_ID,
      type: 'monitor_health',
      monitorId: MONITOR_ID,
      incidentId: null,
      inputWindow: { from: NOW, to: NOW },
    });
    const response = await request(app())
      .get(`/api/v1/ai-analyses/${ANALYSIS_ID}`)
      .set('Authorization', `Bearer ${token(OTHER_ID)}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'AI_ANALYSIS_NOT_FOUND', message: 'AI analysis not found' },
    });
  });

  it('marks a created analysis failed when queue publication fails and does not return false success', async () => {
    publisher.shouldFail = true;
    const response = await request(app())
      .post(`/api/v1/monitors/${MONITOR_ID}/ai-insights`)
      .set('Authorization', `Bearer ${token(OWNER_ID)}`)
      .send({});

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'AI_QUEUE_PUBLISH_FAILED' } });
    expect(analyses.records.get(ANALYSIS_ID)).toMatchObject({
      status: 'failed',
      failureCode: 'AI_QUEUE_PUBLISH_FAILED',
    });
  });
});
