import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CheckResultRecord, IncidentCheckResultRepository } from '../../src/modules/checks/check-result-repository';
import type {
  IncidentPage,
  IncidentRecord,
  IncidentRepository,
  OpenIncidentInput,
  OpenIncidentResult,
} from '../../src/modules/incidents/incident-repository';
import type {
  IncidentMonitorRepository,
  MonitorEvaluationSnapshot,
  MonitorRecord,
} from '../../src/modules/monitors/monitor-repository';
import {
  IncidentProcessor,
  PermanentIncidentJobError,
} from '../../src/workers/incident-processor';
import type { RealtimeDomainEvent } from '../../src/realtime/events';
import type { RealtimeEventPublisher } from '../../src/realtime/publisher';

const USER_ID = '000000000000000000000001';
const MONITOR_ID = '000000000000000000000002';
const RESULT_ID = '000000000000000000000003';
const INCIDENT_ID = '000000000000000000000004';
const NOW = new Date('2026-01-01T00:10:00.000Z');

function monitor(overrides: Partial<MonitorRecord> = {}): MonitorRecord {
  return {
    id: MONITOR_ID,
    userId: USER_ID,
    name: 'API',
    url: 'https://example.com/',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 500,
    failureThreshold: 2,
    recoveryThreshold: 2,
    regions: ['mumbai', 'singapore', 'frankfurt'],
    isPaused: false,
    status: 'pending',
    nextCheckAt: NOW,
    lastCheckedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function checkResult(
  region: string,
  sequence: number,
  success: boolean,
  id = RESULT_ID,
): CheckResultRecord {
  const scheduledAt = new Date(NOW.getTime() + sequence * 60_000);
  return {
    id,
    userId: USER_ID,
    monitorId: MONITOR_ID,
    region,
    scheduledAt,
    startedAt: scheduledAt,
    completedAt: scheduledAt,
    success,
    statusCode: success ? 200 : 503,
    latencyMs: 100,
    errorType: success ? null : 'unexpected_status',
    createdAt: scheduledAt,
  };
}

class MemoryCheckResultRepository implements IncidentCheckResultRepository {
  public triggeringResult: CheckResultRecord | null = checkResult('mumbai', 2, false);
  public readonly histories = new Map<string, CheckResultRecord[]>();
  public readonly requestedLimits: number[] = [];

  public findById(): Promise<CheckResultRecord | null> {
    return Promise.resolve(this.triggeringResult);
  }

  public listRecentByRegion(
    _monitorId: string,
    region: string,
    limit: number,
  ): Promise<CheckResultRecord[]> {
    this.requestedLimits.push(limit);
    return Promise.resolve((this.histories.get(region) ?? []).slice(0, limit));
  }
}

class MemoryMonitorRepository implements IncidentMonitorRepository {
  public current: MonitorRecord | null = monitor();
  public failNextUpdate = false;
  public updateCalls = 0;

  public findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null> {
    if (!this.current || this.current.userId !== userId || this.current.id !== monitorId) {
      return Promise.resolve(null);
    }

    return Promise.resolve({ ...this.current, regions: [...this.current.regions] });
  }

  public updateEvaluationStatus(
    _userId: string,
    _monitorId: string,
    snapshot: MonitorEvaluationSnapshot,
    status: MonitorRecord['status'],
  ): Promise<boolean> {
    this.updateCalls += 1;

    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      this.current = this.current ? { ...this.current, status: 'degraded' } : null;
      return Promise.resolve(false);
    }

    if (!this.current || this.current.status !== snapshot.status) {
      return Promise.resolve(false);
    }

    this.current = { ...this.current, status };
    return Promise.resolve(true);
  }
}

function createIncident(input: OpenIncidentInput): IncidentRecord {
  return {
    id: INCIDENT_ID,
    userId: input.userId,
    monitorId: input.monitorId,
    status: 'open',
    openedAt: input.openedAt,
    resolvedAt: null,
    triggerReason: input.triggerReason,
    openingStatusEvidence: input.openingStatusEvidence,
    events: [{ type: 'opened', at: input.openedAt, message: 'opened' }],
    createdAt: input.openedAt,
    updatedAt: input.openedAt,
  };
}

class MemoryIncidentRepository implements IncidentRepository {
  public openIncident: IncidentRecord | null = null;
  public openCalls = 0;
  public resolveCalls = 0;
  public simulateOpenRace = false;

  public findOpenByMonitor(): Promise<IncidentRecord | null> {
    return Promise.resolve(this.openIncident);
  }

  public openIdempotently(input: OpenIncidentInput): Promise<OpenIncidentResult> {
    const created = this.openIncident === null;

    if (!this.openIncident) {
      this.openCalls += 1;
      this.openIncident = createIncident(input);
    }

    return Promise.resolve({
      incident: this.openIncident,
      created: this.simulateOpenRace ? false : created,
    });
  }

  public resolveIfOpen(
    _incidentId: string,
    resolvedAt: Date,
  ): Promise<IncidentRecord | null> {
    if (!this.openIncident || this.openIncident.status !== 'open') {
      return Promise.resolve(null);
    }

    this.resolveCalls += 1;
    const resolved: IncidentRecord = {
      ...this.openIncident,
      status: 'resolved',
      resolvedAt,
      updatedAt: resolvedAt,
      events: [
        ...this.openIncident.events,
        { type: 'resolved', at: resolvedAt, message: 'resolved' },
      ],
    };
    this.openIncident = null;
    return Promise.resolve(resolved);
  }

  public listOwnedByMonitor(): Promise<IncidentPage> {
    return Promise.resolve({ incidents: [], total: 0 });
  }

  public findOwnedById(): Promise<IncidentRecord | null> {
    return Promise.resolve(null);
  }
}

class FakeRealtimePublisher implements RealtimeEventPublisher {
  public readonly events: RealtimeDomainEvent[] = [];
  public error: Error | null = null;

  public publish(event: RealtimeDomainEvent): Promise<void> {
    if (this.error) {
      return Promise.reject(this.error);
    }

    this.events.push(event);
    return Promise.resolve();
  }
}

function failingHistory(region: string): CheckResultRecord[] {
  return [checkResult(region, 2, false), checkResult(region, 1, false)];
}

function successfulHistory(region: string): CheckResultRecord[] {
  return [checkResult(region, 4, true), checkResult(region, 3, true)];
}

describe('IncidentProcessor', () => {
  let checks: MemoryCheckResultRepository;
  let monitors: MemoryMonitorRepository;
  let incidents: MemoryIncidentRepository;
  let realtime: FakeRealtimePublisher;
  let processor: IncidentProcessor;

  beforeEach(() => {
    checks = new MemoryCheckResultRepository();
    monitors = new MemoryMonitorRepository();
    incidents = new MemoryIncidentRepository();
    realtime = new FakeRealtimePublisher();
    processor = new IncidentProcessor(
      checks,
      monitors,
      incidents,
      pino({ enabled: false }),
      realtime,
      () => NOW,
    );
  });

  it('rejects malformed job payloads permanently', async () => {
    await expect(processor.process({ checkResultId: 'bad' })).rejects.toBeInstanceOf(
      PermanentIncidentJobError,
    );
  });

  it('treats a missing persisted result as stale', async () => {
    checks.triggeringResult = null;

    await expect(processor.process({ checkResultId: RESULT_ID })).resolves.toEqual({
      status: 'stale',
    });
  });

  it.each([
    ['deleted monitor', null],
    ['paused monitor', monitor({ isPaused: true, status: 'paused' })],
    ['removed triggering region', monitor({ regions: ['singapore', 'frankfurt'] })],
  ])('safely skips a %s', async (_caseName, currentMonitor) => {
    monitors.current = currentMonitor;

    await expect(processor.process({ checkResultId: RESULT_ID })).resolves.toEqual({
      status: 'stale',
    });
    expect(checks.requestedLimits).toHaveLength(0);
  });

  it('queries bounded history for every current region and opens exactly one incident', async () => {
    monitors.current = monitor({ failureThreshold: 3, recoveryThreshold: 2 });
    checks.histories.set('mumbai', [
      checkResult('mumbai', 3, false),
      checkResult('mumbai', 2, false),
      checkResult('mumbai', 1, false),
    ]);
    checks.histories.set('singapore', [
      checkResult('singapore', 3, false),
      checkResult('singapore', 2, false),
      checkResult('singapore', 1, false),
    ]);
    checks.histories.set('frankfurt', successfulHistory('frankfurt'));

    await expect(processor.process({ checkResultId: RESULT_ID })).resolves.toEqual({
      status: 'updated',
      monitorStatus: 'down',
    });
    await processor.process({ checkResultId: RESULT_ID });

    expect(checks.requestedLimits).toEqual([3, 3, 3, 3, 3, 3]);
    expect(incidents.openCalls).toBe(1);
    expect(incidents.openIncident?.openingStatusEvidence).toMatchObject({
      requiredConsensus: 2,
      failureThreshold: 3,
    });
    expect(monitors.current).toMatchObject({ status: 'down' });
    expect(realtime.events.map((event) => event.type)).toEqual([
      'monitor.status_changed',
      'incident.opened',
    ]);
    expect(realtime.events[0]).toMatchObject({
      eventId: `monitor-status:${MONITOR_ID}:pending:down:${String(NOW.getTime())}`,
      payload: {
        monitorId: MONITOR_ID,
        previousStatus: 'pending',
        status: 'down',
        changedAt: NOW.toISOString(),
      },
    });
    expect(realtime.events[1]).toMatchObject({
      eventId: `incident-opened:${INCIDENT_ID}`,
      payload: {
        incidentId: INCIDENT_ID,
        monitorId: MONITOR_ID,
        status: 'open',
        triggerReason: 'regional_failure_consensus',
      },
    });
  });

  it('resolves an open incident once after recovery consensus', async () => {
    monitors.current = monitor({ status: 'down' });
    checks.histories.set('mumbai', successfulHistory('mumbai'));
    checks.histories.set('singapore', successfulHistory('singapore'));
    checks.histories.set('frankfurt', failingHistory('frankfurt'));
    incidents.openIncident = createIncident({
      userId: USER_ID,
      monitorId: MONITOR_ID,
      openedAt: new Date('2026-01-01T00:00:00.000Z'),
      triggerReason: 'regional_failure_consensus',
      openingStatusEvidence: {
        requiredConsensus: 2,
        failureThreshold: 2,
        regions: [
          {
            region: 'mumbai',
            consecutiveFailures: 2,
            latestErrorType: 'unexpected_status',
          },
        ],
      },
    });

    await expect(processor.process({ checkResultId: RESULT_ID })).resolves.toEqual({
      status: 'updated',
      monitorStatus: 'degraded',
    });
    await processor.process({ checkResultId: RESULT_ID });

    expect(incidents.resolveCalls).toBe(1);
    expect(monitors.current.status).toBe('degraded');
    expect(realtime.events.map((event) => event.type)).toEqual([
      'monitor.status_changed',
      'incident.resolved',
    ]);
    expect(realtime.events[1]).toMatchObject({
      eventId: `incident-resolved:${INCIDENT_ID}`,
      payload: {
        incidentId: INCIDENT_ID,
        openedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: NOW.toISOString(),
        durationMs: 600_000,
      },
    });
  });

  it('does not publish incident.opened when the idempotent open lost a race', async () => {
    checks.histories.set('mumbai', failingHistory('mumbai'));
    checks.histories.set('singapore', failingHistory('singapore'));
    checks.histories.set('frankfurt', successfulHistory('frankfurt'));
    incidents.simulateOpenRace = true;

    await processor.process({ checkResultId: RESULT_ID });

    expect(incidents.openCalls).toBe(1);
    expect(realtime.events.map((event) => event.type)).toEqual([
      'monitor.status_changed',
    ]);
  });

  it('publishes no transition event when monitor status is unchanged', async () => {
    monitors.current = monitor({ status: 'down' });
    checks.histories.set('mumbai', failingHistory('mumbai'));
    checks.histories.set('singapore', failingHistory('singapore'));
    checks.histories.set('frankfurt', successfulHistory('frankfurt'));
    incidents.openIncident = createIncident({
      userId: USER_ID,
      monitorId: MONITOR_ID,
      openedAt: new Date('2026-01-01T00:00:00.000Z'),
      triggerReason: 'regional_failure_consensus',
      openingStatusEvidence: {
        requiredConsensus: 2,
        failureThreshold: 2,
        regions: [
          {
            region: 'mumbai',
            consecutiveFailures: 2,
            latestErrorType: 'unexpected_status',
          },
        ],
      },
    });

    await expect(processor.process({ checkResultId: RESULT_ID })).resolves.toEqual({
      status: 'unchanged',
      monitorStatus: 'down',
    });
    expect(realtime.events).toHaveLength(0);
  });

  it('keeps status and incident mutations successful when realtime publishing fails', async () => {
    checks.histories.set('mumbai', failingHistory('mumbai'));
    checks.histories.set('singapore', failingHistory('singapore'));
    checks.histories.set('frankfurt', successfulHistory('frankfurt'));
    realtime.error = new Error('Realtime Redis unavailable');

    await expect(processor.process({ checkResultId: RESULT_ID })).resolves.toEqual({
      status: 'updated',
      monitorStatus: 'down',
    });
    expect(monitors.current).toMatchObject({ status: 'down' });
    expect(incidents.openIncident?.status).toBe('open');
  });

  it('re-evaluates after a concurrent status write and converges to down', async () => {
    monitors.current = monitor({ status: 'healthy' });
    monitors.failNextUpdate = true;
    checks.histories.set('mumbai', failingHistory('mumbai'));
    checks.histories.set('singapore', failingHistory('singapore'));
    checks.histories.set('frankfurt', successfulHistory('frankfurt'));

    await expect(processor.process({ checkResultId: RESULT_ID })).resolves.toEqual({
      status: 'updated',
      monitorStatus: 'down',
    });

    expect(monitors.updateCalls).toBe(2);
    expect(incidents.openCalls).toBe(1);
    expect(monitors.current.status).toBe('down');
  });
});
