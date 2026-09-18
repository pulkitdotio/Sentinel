import type { Logger } from 'pino';

import {
  realtimeDomainEventSchema,
  type RealtimeDomainEvent,
} from '../../realtime/events';
import { userRoom, type RealtimeSocketServer } from './socket-server';

export interface RealtimeRedisSubscriber {
  on(event: 'message', listener: (channel: string, message: string) => void): void;
  off(event: 'message', listener: (channel: string, message: string) => void): void;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
}

export class RealtimeRedisBridge {
  // Redis Pub/Sub is intentionally non-durable. MongoDB and REST remain the
  // authoritative recovery path when a subscriber is disconnected.
  private started = false;

  private readonly messageListener = (channel: string, message: string): void => {
    if (channel === this.channel) {
      this.handleMessage(message);
    }
  };

  public constructor(
    private readonly subscriber: RealtimeRedisSubscriber,
    private readonly channel: string,
    private readonly io: RealtimeSocketServer,
    private readonly logger: Logger,
  ) {}

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.subscriber.on('message', this.messageListener);

    try {
      await this.subscriber.subscribe(this.channel);
      this.started = true;
      this.logger.info({ channel: this.channel }, 'Realtime Redis subscriber started');
    } catch (error: unknown) {
      this.subscriber.off('message', this.messageListener);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.subscriber.off('message', this.messageListener);
    await this.subscriber.unsubscribe(this.channel);
    this.started = false;
    this.logger.info({ channel: this.channel }, 'Realtime Redis subscriber stopped');
  }

  public handleMessage(message: string): void {
    let decoded: unknown;

    try {
      decoded = JSON.parse(message) as unknown;
    } catch {
      this.logger.warn(
        { channel: this.channel, reason: 'malformed_json' },
        'Ignoring invalid realtime Redis message',
      );
      return;
    }

    const parsedEvent = realtimeDomainEventSchema.safeParse(decoded);

    if (!parsedEvent.success) {
      this.logger.warn(
        { channel: this.channel, reason: 'schema_validation_failed' },
        'Ignoring invalid realtime Redis message',
      );
      return;
    }

    this.emitToUser(parsedEvent.data);
  }

  private emitToUser(event: RealtimeDomainEvent): void {
    const room = userRoom(event.userId);

    switch (event.type) {
      case 'check.completed':
        this.io.to(room).emit(event.type, event.payload);
        break;
      case 'monitor.status_changed':
        this.io.to(room).emit(event.type, event.payload);
        break;
      case 'incident.opened':
        this.io.to(room).emit(event.type, event.payload);
        break;
      case 'incident.resolved':
        this.io.to(room).emit(event.type, event.payload);
        break;
    }
  }
}
