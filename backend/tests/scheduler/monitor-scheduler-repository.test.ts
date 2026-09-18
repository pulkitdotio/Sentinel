import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MonitorModel } from '../../src/database/models/monitor';
import { MongooseMonitorRepository } from '../../src/modules/monitors/monitor-repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const NEXT = new Date('2026-01-01T00:01:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MongooseMonitorRepository scheduler operations', () => {
  it('queries only active due monitors in sorted bounded batches', async () => {
    const monitorDocument = new MonitorModel({
      _id: new Types.ObjectId('000000000000000000000001'),
      userId: new Types.ObjectId('000000000000000000000002'),
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
      nextCheckAt: NOW,
    });
    const exec = vi.fn().mockResolvedValue([monitorDocument]);
    const query = {
      sort: vi.fn(),
      limit: vi.fn(),
      select: vi.fn(),
      exec,
    };
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.select.mockReturnValue(query);
    const find = vi.spyOn(MonitorModel, 'find').mockReturnValue(query as never);
    const repository = new MongooseMonitorRepository();

    const result = await repository.findDue(NOW, 100);

    expect(find).toHaveBeenCalledWith({ isPaused: false, nextCheckAt: { $lte: NOW } });
    expect(query.sort).toHaveBeenCalledWith({ nextCheckAt: 1 });
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(query.select).toHaveBeenCalledWith({
      userId: 1,
      intervalSeconds: 1,
      regions: 1,
      nextCheckAt: 1,
    });
    expect(result).toEqual([
      {
        id: '000000000000000000000001',
        userId: '000000000000000000000002',
        intervalSeconds: 60,
        regions: ['mumbai'],
        nextCheckAt: NOW,
      },
    ]);
  });

  it('advances with an active-state and old-nextCheckAt compare-and-set filter', async () => {
    const exec = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOne = vi
      .spyOn(MonitorModel, 'updateOne')
      .mockReturnValue({ exec } as never);
    const repository = new MongooseMonitorRepository();

    await expect(
      repository.advanceNextCheckAt('000000000000000000000001', NOW, NEXT),
    ).resolves.toBe(true);
    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: '000000000000000000000001',
        isPaused: false,
        nextCheckAt: NOW,
      },
      { $set: { nextCheckAt: NEXT } },
    );
  });

  it('reports a stale conditional advancement without treating it as an error', async () => {
    vi.spyOn(MonitorModel, 'updateOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as never);
    const repository = new MongooseMonitorRepository();

    await expect(
      repository.advanceNextCheckAt('000000000000000000000001', NOW, NEXT),
    ).resolves.toBe(false);
  });

  it('updates lastCheckedAt monotonically without changing monitor health', async () => {
    const exec = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOne = vi
      .spyOn(MonitorModel, 'updateOne')
      .mockReturnValue({ exec } as never);
    const repository = new MongooseMonitorRepository();

    await repository.updateLastCheckedAt(
      '000000000000000000000002',
      '000000000000000000000001',
      NEXT,
    );

    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: '000000000000000000000001',
        userId: '000000000000000000000002',
      },
      { $max: { lastCheckedAt: NEXT } },
    );
  });
});
