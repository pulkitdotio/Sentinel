import { afterEach, describe, expect, it, vi } from 'vitest';

import { MonitorModel } from '../../src/database/models/monitor';
import {
  MongooseMonitorRepository,
  type MonitorEvaluationSnapshot,
} from '../../src/modules/monitors/monitor-repository';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MongooseMonitorRepository incident evaluation operations', () => {
  it('writes health with an active configuration-and-status compare-and-set filter', async () => {
    const exec = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOne = vi.spyOn(MonitorModel, 'updateOne').mockReturnValue({ exec } as never);
    const repository = new MongooseMonitorRepository();
    const snapshot: MonitorEvaluationSnapshot = {
      status: 'degraded',
      regions: ['mumbai', 'singapore'],
      failureThreshold: 3,
      recoveryThreshold: 2,
      latencyThresholdMs: 500,
    };

    await expect(
      repository.updateEvaluationStatus(
        '000000000000000000000001',
        '000000000000000000000002',
        snapshot,
        'down',
      ),
    ).resolves.toBe(true);
    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: '000000000000000000000002',
        userId: '000000000000000000000001',
        isPaused: false,
        status: 'degraded',
        regions: ['mumbai', 'singapore'],
        failureThreshold: 3,
        recoveryThreshold: 2,
        latencyThresholdMs: 500,
      },
      { $set: { status: 'down' } },
    );
  });

  it('reports a stale evaluator write without overwriting current state', async () => {
    vi.spyOn(MonitorModel, 'updateOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as never);
    const repository = new MongooseMonitorRepository();

    await expect(
      repository.updateEvaluationStatus(
        '000000000000000000000001',
        '000000000000000000000002',
        {
          status: 'healthy',
          regions: ['mumbai'],
          failureThreshold: 2,
          recoveryThreshold: 2,
          latencyThresholdMs: 500,
        },
        'degraded',
      ),
    ).resolves.toBe(false);
  });
});
