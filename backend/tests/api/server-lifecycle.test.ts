import { createServer } from 'node:http';

import type Redis from 'ioredis';
import mongoose from 'mongoose';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RealtimeRedisBridge } from '../../src/api/socket/realtime-bridge';
import { attachSocketServer } from '../../src/api/socket/socket-server';
import {
  createApiRedisConnections,
  stopServer,
  type RunningServer,
} from '../../src/api/server';

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeRedisConnection(): {
  connection: Redis;
  quit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} {
  const quit = vi.fn().mockResolvedValue('OK');
  const disconnect = vi.fn();
  const connection = {
    status: 'ready',
    quit,
    disconnect,
  } as unknown as Redis;

  return { connection, quit, disconnect };
}

describe('API realtime lifecycle', () => {
  it('creates a dedicated Redis subscriber separate from the command connection', () => {
    const connections = createApiRedisConnections(
      'redis://localhost:6379',
      pino({ enabled: false }),
    );

    expect(connections.redisSubscriber).not.toBe(connections.redisConnection);

    connections.redisSubscriber.disconnect(false);
    connections.redisConnection.disconnect(false);
  });

  it('closes Socket.IO, the bridge, both Redis connections, HTTP, and MongoDB', async () => {
    const logger = pino({ enabled: false });
    const httpServer = createServer();
    const socketServer = attachSocketServer(httpServer, 'http://client.example.com', {
      secret: 'a-test-secret-that-is-long-enough',
      expiresIn: '7d',
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const closeSocket = vi.spyOn(socketServer, 'close');
    const stopBridge = vi.fn().mockResolvedValue(undefined);
    const command = fakeRedisConnection();
    const subscriber = fakeRedisConnection();
    const disconnectMongo = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
    const runtime: RunningServer = {
      httpServer,
      socketServer,
      redisConnection: command.connection,
      redisSubscriber: subscriber.connection,
      realtimeBridge: { stop: stopBridge } as unknown as RealtimeRedisBridge,
      logger,
    };

    await stopServer(runtime);

    expect(closeSocket).toHaveBeenCalledOnce();
    expect(stopBridge).toHaveBeenCalledOnce();
    expect(subscriber.quit).toHaveBeenCalledOnce();
    expect(command.quit).toHaveBeenCalledOnce();
    expect(subscriber.disconnect).not.toHaveBeenCalled();
    expect(command.disconnect).not.toHaveBeenCalled();
    expect(httpServer.listening).toBe(false);
    expect(disconnectMongo).toHaveBeenCalledOnce();
  });
});
