import { describe, expect, it, vi } from 'vitest';

import { realtimeChannelName } from '../../src/realtime/channel';
import type { RealtimeDomainEvent } from '../../src/realtime/events';
import { RedisRealtimeEventPublisher } from '../../src/realtime/publisher';

const event: RealtimeDomainEvent = {
  version: 1,
  eventId: 'check:000000000000000000000003',
  userId: '000000000000000000000001',
  type: 'check.completed',
  occurredAt: '2026-01-01T00:00:01.000Z',
  payload: {
    checkResultId: '000000000000000000000003',
    monitorId: '000000000000000000000002',
    region: 'mumbai',
    scheduledAt: '2026-01-01T00:00:00.000Z',
    success: false,
    statusCode: null,
    latencyMs: null,
    errorType: 'timeout',
  },
};

describe('RedisRealtimeEventPublisher', () => {
  it('derives the versioned channel from the existing BullMQ prefix', () => {
    expect(realtimeChannelName('sentinel')).toBe('sentinel:realtime:v1');
  });

  it('validates and serializes an event onto the configured channel', async () => {
    const publish = vi.fn().mockResolvedValue(1);
    const publisher = new RedisRealtimeEventPublisher({ publish }, 'sentinel:realtime:v1');

    await publisher.publish(event);

    expect(publish).toHaveBeenCalledTimes(1);
    const published = publish.mock.calls[0];
    expect(published?.[0]).toBe('sentinel:realtime:v1');
    expect(JSON.parse(String(published?.[1])) as unknown).toEqual(event);
  });

  it('does not publish an event that fails contract validation', async () => {
    const publish = vi.fn().mockResolvedValue(1);
    const publisher = new RedisRealtimeEventPublisher({ publish }, 'sentinel:realtime:v1');
    const invalid = {
      ...event,
      userId: 'unsafe-room-name',
    } as RealtimeDomainEvent;

    await expect(publisher.publish(invalid)).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
  });
});
