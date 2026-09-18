import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type {
  CheckResultIdentity,
  CheckResultRecord,
  CheckResultRepository,
  CreateCheckResultRecord,
} from '../../src/modules/checks/check-result-repository';
import type {
  MonitorRecord,
  ProbeMonitorRepository,
} from '../../src/modules/monitors/monitor-repository';
import type {
  HttpChecker,
  HttpCheckOutcome,
} from '../../src/monitoring/http-checker';
import type { IncidentEvaluationPublisher } from '../../src/queues/incident-evaluation-publisher';
import type { ProbeJobPayload } from '../../src/queues/jobs/probe';
import type { RealtimeDomainEvent } from '../../src/realtime/events';
import type { RealtimeEventPublisher } from '../../src/realtime/publisher';
import {
  PermanentProbeJobError,
  ProbeProcessor,
} from '../../src/workers/probe-processor';

const MONITOR_ID = '000000000000000000000001';
const USER_ID = '000000000000000000000002';
const CHECK_RESULT_ID = '000000000000000000000003';
const SCHEDULED_AT = new Date('2026-01-01T00:00:00.000Z');
const STARTED_AT = new Date('2026-01-01T00:00:00.100Z');
const COMPLETED_AT = new Date('2026-01-01T00:00:00.250Z');

const payload: ProbeJobPayload = {
  monitorId: MONITOR_ID,
  userId: USER_ID,
  region: 'mumbai',
  scheduledAt: SCHEDULED_AT.toISOString(),
};

const successOutcome: HttpCheckOutcome = {
  success: true,
  statusCode: 200,
  latencyMs: 145,
  errorType: null,
};

function monitor(overrides: Partial<MonitorRecord> = {}): MonitorRecord {
  return {
    id: MONITOR_ID,
    userId: USER_ID,
    name: 'Production API',
    url: 'https://api.example.com/health',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 800,
    failureThreshold: 3,
    recoveryThreshold: 2,
    regions: ['mumbai'],
    isPaused: false,
    status: 'pending',
    nextCheckAt: new Date('2026-01-01T00:01:00.000Z'),
    lastCheckedAt: null,
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
    updatedAt: new Date('2025-12-01T00:00:00.000Z'),
    ...overrides,
  };
}

function resultRecord(
  overrides: Partial<CheckResultRecord> = {},
): CheckResultRecord {
  return {
    id: CHECK_RESULT_ID,
    userId: USER_ID,
    monitorId: MONITOR_ID,
    region: 'mumbai',
    scheduledAt: SCHEDULED_AT,
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    success: true,
    statusCode: 200,
    latencyMs: 145,
    errorType: null,
    createdAt: COMPLETED_AT,
    ...overrides,
  };
}

function identityKey(identity: CheckResultIdentity): string {
  return `${identity.monitorId}-${identity.region}-${identity.scheduledAt.toISOString()}`;
}

class FakeMonitorRepository implements ProbeMonitorRepository {
  public readonly lastCheckedUpdates: Array<{
    userId: string;
    monitorId: string;
    completedAt: Date;
  }> = [];

  public constructor(public currentMonitor: MonitorRecord | null = monitor()) {}

  public findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null> {
    const value = this.currentMonitor;
    return Promise.resolve(
      value?.userId === userId && value.id === monitorId ? value : null,
    );
  }

  public updateLastCheckedAt(
    userId: string,
    monitorId: string,
    completedAt: Date,
  ): Promise<void> {
    this.lastCheckedUpdates.push({ userId, monitorId, completedAt });
    return Promise.resolve();
  }
}

class FakeCheckResultRepository implements CheckResultRepository {
  public readonly records = new Map<string, CheckResultRecord>();
  public readonly saveInputs: CreateCheckResultRecord[] = [];
  public raceWinner: CheckResultRecord | undefined;

  public findByIdentity(identity: CheckResultIdentity): Promise<CheckResultRecord | null> {
    return Promise.resolve(this.records.get(identityKey(identity)) ?? null);
  }

  public saveIdempotently(input: CreateCheckResultRecord): Promise<CheckResultRecord> {
    this.saveInputs.push(input);
    const key = identityKey(input);
    const existing = this.records.get(key);

    if (existing) {
      return Promise.resolve(existing);
    }

    const stored = this.raceWinner ?? resultRecord(input);
    this.records.set(key, stored);
    return Promise.resolve(stored);
  }
}

class FakeIncidentPublisher implements IncidentEvaluationPublisher {
  public readonly checkResultIds: string[] = [];
  public failuresRemaining = 0;

  public enqueue(input: { checkResultId: string }): Promise<{ jobId: string }> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Promise.reject(new Error('Redis unavailable'));
    }

    this.checkResultIds.push(input.checkResultId);
    return Promise.resolve({ jobId: `incident-eval-${input.checkResultId}` });
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

function createContext(options: {
  currentMonitor?: MonitorRecord | null;
  checkOutcome?: HttpCheckOutcome;
} = {}) {
  const monitorRepository = new FakeMonitorRepository(
    options.currentMonitor === undefined ? monitor() : options.currentMonitor,
  );
  const checkResultRepository = new FakeCheckResultRepository();
  const check = vi.fn().mockResolvedValue(options.checkOutcome ?? successOutcome);
  const httpChecker: HttpChecker = { check };
  const incidentPublisher = new FakeIncidentPublisher();
  const realtimePublisher = new FakeRealtimePublisher();
  const times = [STARTED_AT, COMPLETED_AT];
  const processor = new ProbeProcessor(
    'mumbai',
    monitorRepository,
    checkResultRepository,
    httpChecker,
    incidentPublisher,
    pino({ enabled: false }),
    realtimePublisher,
    () => times.shift() ?? COMPLETED_AT,
  );

  return {
    processor,
    monitorRepository,
    checkResultRepository,
    incidentPublisher,
    realtimePublisher,
    check,
  };
}

describe('ProbeProcessor', () => {
  it('rejects invalid or wrong-region jobs without checking a target', async () => {
    const context = createContext();

    await expect(context.processor.process({ invalid: true })).rejects.toBeInstanceOf(
      PermanentProbeJobError,
    );
    await expect(
      context.processor.process({ ...payload, region: 'singapore' }),
    ).rejects.toBeInstanceOf(PermanentProbeJobError);
    expect(context.check).not.toHaveBeenCalled();
  });

  it.each([
    ['missing monitor', null],
    ['paused monitor', monitor({ isPaused: true, status: 'paused' })],
    ['removed region', monitor({ regions: ['singapore'] })],
  ])('treats a %s as stale without an outbound request', async (_name, currentMonitor) => {
    const context = createContext({ currentMonitor });

    await expect(context.processor.process(payload)).resolves.toEqual({ status: 'stale' });
    expect(context.check).not.toHaveBeenCalled();
    expect(context.checkResultRepository.saveInputs).toHaveLength(0);
    expect(context.incidentPublisher.checkResultIds).toHaveLength(0);
  });

  it('persists the exact successful result fields and publishes evaluation work', async () => {
    const context = createContext();

    await expect(context.processor.process(payload)).resolves.toEqual({
      status: 'processed',
      checkResultId: CHECK_RESULT_ID,
    });
    expect(context.check).toHaveBeenCalledWith({
      url: 'https://api.example.com/health',
      method: 'GET',
      timeoutMs: 5_000,
      expectedStatusCodes: [200],
    });
    expect(context.checkResultRepository.saveInputs[0]).toEqual({
      userId: USER_ID,
      monitorId: MONITOR_ID,
      region: 'mumbai',
      scheduledAt: SCHEDULED_AT,
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      success: true,
      statusCode: 200,
      latencyMs: 145,
      errorType: null,
    });
    expect(context.incidentPublisher.checkResultIds).toEqual([CHECK_RESULT_ID]);
    expect(context.monitorRepository.lastCheckedUpdates).toEqual([
      { userId: USER_ID, monitorId: MONITOR_ID, completedAt: COMPLETED_AT },
    ]);
    expect(context.realtimePublisher.events).toEqual([
      {
        version: 1,
        eventId: `check:${CHECK_RESULT_ID}`,
        userId: USER_ID,
        type: 'check.completed',
        occurredAt: COMPLETED_AT.toISOString(),
        payload: {
          checkResultId: CHECK_RESULT_ID,
          monitorId: MONITOR_ID,
          region: 'mumbai',
          scheduledAt: SCHEDULED_AT.toISOString(),
          success: true,
          statusCode: 200,
          latencyMs: 145,
          errorType: null,
        },
      },
    ]);
    expect(JSON.stringify(context.realtimePublisher.events)).not.toContain('errorMetadata');
    expect(JSON.stringify(context.realtimePublisher.events)).not.toContain('responseBody');
  });

  it('persists endpoint failures as results instead of throwing infrastructure errors', async () => {
    const context = createContext({
      checkOutcome: {
        success: false,
        statusCode: null,
        latencyMs: null,
        errorType: 'timeout',
        errorMetadata: { code: 'TIMEOUT' },
      },
    });

    await expect(context.processor.process(payload)).resolves.toMatchObject({
      status: 'processed',
    });
    expect(context.checkResultRepository.saveInputs[0]).toMatchObject({
      success: false,
      errorType: 'timeout',
      errorMetadata: { code: 'TIMEOUT' },
    });
  });

  it('skips HTTP for an existing logical result and republishes evaluation', async () => {
    const context = createContext();
    const existing = resultRecord();
    context.checkResultRepository.records.set(identityKey(existing), existing);

    await expect(context.processor.process(payload)).resolves.toEqual({
      status: 'existing',
      checkResultId: CHECK_RESULT_ID,
    });
    expect(context.check).not.toHaveBeenCalled();
    expect(context.incidentPublisher.checkResultIds).toEqual([CHECK_RESULT_ID]);
  });

  it('retries downstream publishing without repeating a persisted HTTP check', async () => {
    const context = createContext();
    context.incidentPublisher.failuresRemaining = 1;

    await expect(context.processor.process(payload)).rejects.toThrow('Redis unavailable');
    expect(context.check).toHaveBeenCalledTimes(1);
    expect(context.checkResultRepository.records).toHaveLength(1);

    await expect(context.processor.process(payload)).resolves.toMatchObject({
      status: 'existing',
    });
    expect(context.check).toHaveBeenCalledTimes(1);
    expect(context.incidentPublisher.checkResultIds).toEqual([CHECK_RESULT_ID]);
  });

  it('does not fail durable monitoring work when realtime publishing fails', async () => {
    const context = createContext();
    context.realtimePublisher.error = new Error('Realtime Redis unavailable');

    await expect(context.processor.process(payload)).resolves.toEqual({
      status: 'processed',
      checkResultId: CHECK_RESULT_ID,
    });
    expect(context.check).toHaveBeenCalledTimes(1);
    expect(context.checkResultRepository.records).toHaveLength(1);
    expect(context.incidentPublisher.checkResultIds).toEqual([CHECK_RESULT_ID]);
  });

  it('uses a stable event id when an existing result is replayed', async () => {
    const context = createContext();

    await context.processor.process(payload);
    await context.processor.process(payload);

    expect(context.check).toHaveBeenCalledTimes(1);
    expect(context.realtimePublisher.events.map((event) => event.eventId)).toEqual([
      `check:${CHECK_RESULT_ID}`,
      `check:${CHECK_RESULT_ID}`,
    ]);
  });

  it('uses the winning persisted record when another execution wins the race', async () => {
    const context = createContext();
    const winner = resultRecord({ id: '000000000000000000000004' });
    context.checkResultRepository.raceWinner = winner;

    await expect(context.processor.process(payload)).resolves.toEqual({
      status: 'processed',
      checkResultId: winner.id,
    });
    expect(context.checkResultRepository.records).toHaveLength(1);
    expect(context.incidentPublisher.checkResultIds).toEqual([winner.id]);
  });
});
