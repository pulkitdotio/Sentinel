import pino from 'pino';
import { describe, expect, it } from 'vitest';

import {
  RealtimeRedisBridge,
  type RealtimeRedisSubscriber,
} from '../../src/api/socket/realtime-bridge';
import type { RealtimeSocketServer } from '../../src/api/socket/socket-server';
import type { RealtimeDomainEvent } from '../../src/realtime/events';

const CHANNEL = 'sentinel:realtime:v1';
const USER_ID = '000000000000000000000001';

const event: RealtimeDomainEvent = {
  version: 1,
  eventId: 'check:000000000000000000000003',
  userId: USER_ID,
  type: 'check.completed',
  occurredAt: '2026-01-01T00:00:01.000Z',
  payload: {
    checkResultId: '000000000000000000000003',
    monitorId: '000000000000000000000002',
    region: 'mumbai',
    scheduledAt: '2026-01-01T00:00:00.000Z',
    success: true,
    statusCode: 200,
    latencyMs: 100,
    errorType: null,
  },
};

class FakeSubscriber implements RealtimeRedisSubscriber {
  public readonly subscriptions: string[] = [];
  public readonly unsubscriptions: string[] = [];
  private listener: ((channel: string, message: string) => void) | null = null;

  public on(
    _event: 'message',
    listener: (channel: string, message: string) => void,
  ): void {
    this.listener = listener;
  }

  public off(
    _event: 'message',
    listener: (channel: string, message: string) => void,
  ): void {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  public subscribe(channel: string): Promise<unknown> {
    this.subscriptions.push(channel);
    return Promise.resolve(1);
  }

  public unsubscribe(channel: string): Promise<unknown> {
    this.unsubscriptions.push(channel);
    return Promise.resolve(0);
  }

  public emit(channel: string, message: string): void {
    this.listener?.(channel, message);
  }
}

interface Emission {
  room: string;
  eventName: string;
  payload: unknown;
}

function fakeSocketServer(emissions: Emission[]): RealtimeSocketServer {
  return {
    to: (room: string) => ({
      emit: (eventName: string, payload: unknown) => {
        emissions.push({ room, eventName, payload });
      },
    }),
  } as unknown as RealtimeSocketServer;
}

describe('RealtimeRedisBridge', () => {
  it('subscribes, validates JSON, and derives the user room from the event userId', async () => {
    const subscriber = new FakeSubscriber();
    const emissions: Emission[] = [];
    const bridge = new RealtimeRedisBridge(
      subscriber,
      CHANNEL,
      fakeSocketServer(emissions),
      pino({ enabled: false }),
    );

    await bridge.start();
    subscriber.emit(CHANNEL, JSON.stringify(event));

    expect(subscriber.subscriptions).toEqual([CHANNEL]);
    expect(emissions).toEqual([
      {
        room: `user:${USER_ID}`,
        eventName: 'check.completed',
        payload: event.payload,
      },
    ]);

    await bridge.stop();
    expect(subscriber.unsubscriptions).toEqual([CHANNEL]);
  });

  it('ignores malformed and schema-invalid messages without breaking later delivery', () => {
    const subscriber = new FakeSubscriber();
    const emissions: Emission[] = [];
    const bridge = new RealtimeRedisBridge(
      subscriber,
      CHANNEL,
      fakeSocketServer(emissions),
      pino({ enabled: false }),
    );

    expect(() => bridge.handleMessage('{not-json')).not.toThrow();
    expect(() =>
      bridge.handleMessage(JSON.stringify({ ...event, userId: 'user:attacker' })),
    ).not.toThrow();
    expect(() => bridge.handleMessage(JSON.stringify(event))).not.toThrow();

    expect(emissions).toHaveLength(1);
    expect(emissions[0]?.room).toBe(`user:${USER_ID}`);
  });

  it('ignores messages from a different Redis channel', async () => {
    const subscriber = new FakeSubscriber();
    const emissions: Emission[] = [];
    const bridge = new RealtimeRedisBridge(
      subscriber,
      CHANNEL,
      fakeSocketServer(emissions),
      pino({ enabled: false }),
    );

    await bridge.start();
    subscriber.emit('attacker-selected-room', JSON.stringify(event));

    expect(emissions).toHaveLength(0);
    await bridge.stop();
  });
});
