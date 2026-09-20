import { describe, expect, it } from 'vitest';

import type { Monitor, MonitorStatus } from './api/monitor-contracts';
import { countMonitorStatuses } from './monitor-summary';

function monitor(status: MonitorStatus): Monitor {
  return {
    id: status,
    userId: 'user-1',
    name: status,
    url: 'https://example.com/',
    method: 'GET',
    intervalSeconds: 60,
    timeoutMs: 5_000,
    expectedStatusCodes: [200],
    latencyThresholdMs: 800,
    failureThreshold: 3,
    recoveryThreshold: 2,
    regions: ['mumbai'],
    isPaused: status === 'paused',
    status,
    nextCheckAt: '2026-09-20T10:01:00.000Z',
    lastCheckedAt: null,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
  };
}

describe('monitor status summary', () => {
  it('derives every status count from the monitor list', () => {
    const statuses: MonitorStatus[] = ['pending', 'healthy', 'healthy', 'degraded', 'down', 'paused'];
    expect(countMonitorStatuses(statuses.map(monitor))).toEqual({
      total: 6,
      pending: 1,
      healthy: 2,
      degraded: 1,
      down: 1,
      paused: 1,
    });
  });
});
