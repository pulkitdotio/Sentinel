import type Redis from 'ioredis';

import {
  realtimeDomainEventSchema,
  type RealtimeDomainEvent,
} from './events';

export interface RealtimeEventPublisher {
  publish(event: RealtimeDomainEvent): Promise<void>;
}

export const NOOP_REALTIME_EVENT_PUBLISHER: RealtimeEventPublisher = {
  publish: () => Promise.resolve(),
};

export class RedisRealtimeEventPublisher implements RealtimeEventPublisher {
  public constructor(
    private readonly connection: Pick<Redis, 'publish'>,
    private readonly channel: string,
  ) {}

  public async publish(event: RealtimeDomainEvent): Promise<void> {
    const validatedEvent = realtimeDomainEventSchema.parse(event);
    await this.connection.publish(this.channel, JSON.stringify(validatedEvent));
  }
}
