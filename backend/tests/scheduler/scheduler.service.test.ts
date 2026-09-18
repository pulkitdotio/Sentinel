import pino from 'pino';
import { describe, expect, it } from 'vitest';

import type {
  DueMonitorRecord,
  MonitorSchedulerRepository,
} from '../../src/modules/monitors/monitor-repository';
import { createProbeJobId, type ProbeJobPayload } from '../../src/queues/jobs/probe';
import type {
  ProbeJobPublisher,
  PublishedProbeJob,
} from '../../src/queues/probe-job-publisher';
import {
  SCHEDULER_BATCH_SIZE,
  SchedulerService,
} from '../../src/scheduler/scheduler.service';

const TICK_TIME = new Date('2026-01-01T00:10:00.000Z');
const DUE_TIME = new Date('2026-01-01T00:00:00.000Z');
const FUTURE_TIME = new Date('2026-01-01T01:00:00.000Z');
const USER_ID = '000000000000000000000001';

interface StoredMonitor extends DueMonitorRecord {
  isPaused: boolean;
}

function monitor(
  idNumber: number,
  overrides: Partial<StoredMonitor> = {},
): StoredMonitor {
  return {
    id: idNumber.toString(16).padStart(24, '0'),
    userId: USER_ID,
    intervalSeconds: 60,
    regions: ['mumbai'],
    nextCheckAt: DUE_TIME,
    isPaused: false,
    ...overrides,
  };
}

function cloneDueMonitor(value: StoredMonitor): DueMonitorRecord {
  return {
    id: value.id,
    userId: value.userId,
    intervalSeconds: value.intervalSeconds,
    regions: [...value.regions],
    nextCheckAt: new Date(value.nextCheckAt),
  };
}

class InMemorySchedulerRepository implements MonitorSchedulerRepository {
  public readonly advancementAttempts: Array<{
    monitorId: string;
    expectedNextCheckAt: Date;
    nextCheckAt: Date;
  }> = [];
  public lastLimit: number | undefined;
  public rejectAdvancement = false;

  public constructor(public readonly monitors: StoredMonitor[]) {}

  public findDue(now: Date, limit: number): Promise<DueMonitorRecord[]> {
    this.lastLimit = limit;
    const dueMonitors = this.monitors
      .filter((value) => !value.isPaused && value.nextCheckAt.getTime() <= now.getTime())
      .sort((left, right) => left.nextCheckAt.getTime() - right.nextCheckAt.getTime())
      .slice(0, limit)
      .map(cloneDueMonitor);
    return Promise.resolve(dueMonitors);
  }

  public advanceNextCheckAt(
    monitorId: string,
    expectedNextCheckAt: Date,
    nextCheckAt: Date,
  ): Promise<boolean> {
    this.advancementAttempts.push({ monitorId, expectedNextCheckAt, nextCheckAt });
    const value = this.monitors.find((candidate) => candidate.id === monitorId);

    if (
      this.rejectAdvancement ||
      !value ||
      value.isPaused ||
      value.nextCheckAt.getTime() !== expectedNextCheckAt.getTime()
    ) {
      return Promise.resolve(false);
    }

    value.nextCheckAt = new Date(nextCheckAt);
    return Promise.resolve(true);
  }
}

class RecordingProbeJobPublisher implements ProbeJobPublisher {
  public readonly attempts: ProbeJobPayload[] = [];
  public readonly jobs = new Map<string, ProbeJobPayload>();

  public constructor(
    private readonly shouldFail: (payload: ProbeJobPayload) => boolean = () => false,
  ) {}

  public enqueue(payload: ProbeJobPayload): Promise<PublishedProbeJob> {
    const copiedPayload = { ...payload };
    this.attempts.push(copiedPayload);

    if (this.shouldFail(payload)) {
      return Promise.reject(new Error('Queue unavailable'));
    }

    const jobId = createProbeJobId(payload);
    this.jobs.set(jobId, copiedPayload);
    return Promise.resolve({ jobId });
  }
}

function createScheduler(
  monitors: StoredMonitor[],
  shouldFail?: (payload: ProbeJobPayload) => boolean,
): {
  repository: InMemorySchedulerRepository;
  publisher: RecordingProbeJobPublisher;
  scheduler: SchedulerService;
} {
  const repository = new InMemorySchedulerRepository(monitors);
  const publisher = new RecordingProbeJobPublisher(shouldFail);
  const scheduler = new SchedulerService(
    repository,
    publisher,
    pino({ enabled: false }),
  );
  return { repository, publisher, scheduler };
}

describe('SchedulerService', () => {
  it('discovers only active due monitors and uses the bounded batch size', async () => {
    const dueMonitor = monitor(1);
    const futureMonitor = monitor(2, { nextCheckAt: FUTURE_TIME });
    const pausedMonitor = monitor(3, { isPaused: true });
    const context = createScheduler([dueMonitor, futureMonitor, pausedMonitor]);

    await context.scheduler.runTick(TICK_TIME);

    expect(context.repository.lastLimit).toBe(SCHEDULER_BATCH_SIZE);
    expect(context.publisher.attempts.map((job) => job.monitorId)).toEqual([dueMonitor.id]);
  });

  it('does not load or schedule more than 100 due monitors in one tick', async () => {
    const monitors = Array.from({ length: 101 }, (_, index) => monitor(index + 1));
    const context = createScheduler(monitors);

    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts).toHaveLength(100);
    expect(context.repository.advancementAttempts).toHaveLength(100);
  });

  it('creates one small probe job for one configured region', async () => {
    const context = createScheduler([monitor(1)]);

    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts).toHaveLength(1);
    expect(context.publisher.attempts[0]).toEqual({
      monitorId: '000000000000000000000001',
      userId: USER_ID,
      region: 'mumbai',
      scheduledAt: DUE_TIME.toISOString(),
    });
    expect(Object.keys(context.publisher.attempts[0] ?? {}).sort()).toEqual([
      'monitorId',
      'region',
      'scheduledAt',
      'userId',
    ]);
  });

  it('creates one regional job for each of three configured regions', async () => {
    const context = createScheduler([
      monitor(1, { regions: ['mumbai', 'singapore', 'frankfurt'] }),
    ]);

    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts.map((job) => job.region)).toEqual([
      'mumbai',
      'singapore',
      'frankfurt',
    ]);
  });

  it('advances nextCheckAt from the scheduler tick after all enqueues succeed', async () => {
    const storedMonitor = monitor(1, { intervalSeconds: 90 });
    const context = createScheduler([storedMonitor]);

    await context.scheduler.runTick(TICK_TIME);

    expect(storedMonitor.nextCheckAt).toEqual(new Date('2026-01-01T00:11:30.000Z'));
    expect(context.repository.advancementAttempts[0]).toMatchObject({
      monitorId: storedMonitor.id,
      expectedNextCheckAt: DUE_TIME,
      nextCheckAt: new Date('2026-01-01T00:11:30.000Z'),
    });
  });

  it('attempts every region and does not advance when one regional enqueue fails', async () => {
    const storedMonitor = monitor(1, {
      regions: ['mumbai', 'singapore', 'frankfurt'],
    });
    const context = createScheduler(
      [storedMonitor],
      (payload) => payload.region === 'singapore',
    );

    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts.map((job) => job.region)).toEqual([
      'mumbai',
      'singapore',
      'frankfurt',
    ]);
    expect(context.repository.advancementAttempts).toHaveLength(0);
    expect(storedMonitor.nextCheckAt).toEqual(DUE_TIME);
  });

  it('reuses logical job IDs on retry instead of multiplying successful regional jobs', async () => {
    const context = createScheduler(
      [monitor(1, { regions: ['mumbai', 'singapore', 'frankfurt'] })],
      (payload) => payload.region === 'singapore',
    );

    await context.scheduler.runTick(TICK_TIME);
    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts).toHaveLength(6);
    expect(context.publisher.jobs).toHaveLength(2);
    expect(context.repository.advancementAttempts).toHaveLength(0);
  });

  it('treats a stale compare-and-set advancement as concurrency-safe', async () => {
    const storedMonitor = monitor(1);
    const context = createScheduler([storedMonitor]);
    context.repository.rejectAdvancement = true;

    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts).toHaveLength(1);
    expect(context.repository.advancementAttempts).toHaveLength(1);
    expect(storedMonitor.nextCheckAt).toEqual(DUE_TIME);
  });

  it('schedules only one cycle for an overdue monitor', async () => {
    const storedMonitor = monitor(1, {
      nextCheckAt: new Date('2025-12-01T00:00:00.000Z'),
      regions: ['mumbai', 'singapore', 'frankfurt'],
    });
    const context = createScheduler([storedMonitor]);

    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts).toHaveLength(3);
    expect(new Set(context.publisher.attempts.map((job) => job.scheduledAt))).toEqual(
      new Set(['2025-12-01T00:00:00.000Z']),
    );
    expect(storedMonitor.nextCheckAt).toEqual(new Date('2026-01-01T00:11:00.000Z'));
  });

  it('continues with the rest of the batch after one monitor fails', async () => {
    const failingMonitor = monitor(1);
    const succeedingMonitor = monitor(2);
    const context = createScheduler(
      [failingMonitor, succeedingMonitor],
      (payload) => payload.monitorId === failingMonitor.id,
    );

    await context.scheduler.runTick(TICK_TIME);

    expect(context.publisher.attempts.map((job) => job.monitorId)).toEqual([
      failingMonitor.id,
      succeedingMonitor.id,
    ]);
    expect(failingMonitor.nextCheckAt).toEqual(DUE_TIME);
    expect(succeedingMonitor.nextCheckAt).toEqual(new Date('2026-01-01T00:11:00.000Z'));
  });
});
