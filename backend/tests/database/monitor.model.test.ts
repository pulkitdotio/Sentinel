import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { MonitorModel } from '../../src/database/models/monitor';

function validMonitorInput(): Record<string, unknown> {
  return {
    userId: new Types.ObjectId(),
    name: 'Production API',
    url: 'https://api.example.com/health',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 800,
    failureThreshold: 3,
    recoveryThreshold: 2,
    regions: ['mumbai', 'singapore'],
    nextCheckAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('Monitor model', () => {
  it('applies the documented initial state defaults', () => {
    const monitor = new MonitorModel({
      ...validMonitorInput(),
      url: '  https://API.Example.com:443/health  ',
    });

    expect(monitor.isPaused).toBe(false);
    expect(monitor.status).toBe('pending');
    expect(monitor.lastCheckedAt).toBeNull();
    expect(monitor.url).toBe('https://api.example.com/health');
  });

  it('defines timestamps and the listing and scheduler indexes', () => {
    const indexes = MonitorModel.schema.indexes().map(([fields]) => fields);

    expect(MonitorModel.schema.options.timestamps).toBe(true);
    expect(indexes).toContainEqual({ userId: 1, createdAt: -1 });
    expect(indexes).toContainEqual({ isPaused: 1, nextCheckAt: 1 });
  });

  it('rejects invalid methods, empty arrays, duplicates, and out-of-bound values', async () => {
    const monitor = new MonitorModel({
      ...validMonitorInput(),
      method: 'POST',
      intervalSeconds: 9,
      timeoutMs: 30_001,
      expectedStatusCodes: [99, 99],
      failureThreshold: 0,
      recoveryThreshold: 11,
      regions: [],
    });

    await expect(monitor.validate()).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('does not embed check history in the schema', () => {
    expect(MonitorModel.schema.path('checks')).toBeUndefined();
    expect(MonitorModel.schema.path('checkResults')).toBeUndefined();
  });

  it('rejects malformed, non-HTTP, and credential-bearing URLs', async () => {
    for (const url of [
      'not a URL',
      'ftp://example.com/health',
      'https://user:secret@example.com/health',
    ]) {
      const monitor = new MonitorModel({ ...validMonitorInput(), url });
      await expect(monitor.validate()).rejects.toMatchObject({ name: 'ValidationError' });
    }
  });
});
