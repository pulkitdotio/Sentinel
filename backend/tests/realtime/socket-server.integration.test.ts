import { createServer, type Server as HttpServer } from 'node:http';

import jsonwebtoken from 'jsonwebtoken';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  attachSocketServer,
  SOCKET_AUTHENTICATION_ERROR,
  userRoom,
  type RealtimeSocketServer,
} from '../../src/api/socket/socket-server';
import { RealtimeRedisBridge } from '../../src/api/socket/realtime-bridge';
import { createAccessToken } from '../../src/modules/auth/jwt';
import type {
  CheckCompletedPayload,
  RealtimeDomainEvent,
} from '../../src/realtime/events';
import pino from 'pino';

const SECRET = 'a-test-secret-that-is-long-enough';
const OTHER_SECRET = 'a-different-secret-that-is-long-enough';
const USER_A = '000000000000000000000001';
const USER_B = '000000000000000000000002';
const MONITOR_ID = '000000000000000000000003';
const CHECK_RESULT_ID = '000000000000000000000004';

function token(userId: string, secret = SECRET): string {
  return createAccessToken(userId, { secret, expiresIn: '7d' });
}

function connect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function connectionError(socket: ClientSocket): Promise<Error> {
  return new Promise((resolve) => {
    socket.once('connect_error', resolve);
  });
}

function nextCheckEvent(socket: ClientSocket): Promise<CheckCompletedPayload> {
  return new Promise((resolve) => {
    socket.once('check.completed', resolve);
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe('authenticated Socket.IO server', () => {
  let httpServer: HttpServer;
  let socketServer: RealtimeSocketServer;
  let serverUrl: string;
  let clients: ClientSocket[];

  beforeEach(async () => {
    clients = [];
    httpServer = createServer((_request, response) => {
      response.statusCode = 204;
      response.end();
    });
    socketServer = attachSocketServer(httpServer, 'http://client.example.com', {
      secret: SECRET,
      expiresIn: '7d',
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', () => {
        httpServer.off('error', reject);
        resolve();
      });
    });

    const address = httpServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Ephemeral HTTP server did not expose a TCP address');
    }

    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect();
    }

    await socketServer.close();

    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  function clientWithAuth(auth?: Record<string, unknown>): ClientSocket {
    const options = {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    };
    const client =
      auth === undefined
        ? createSocketClient(serverUrl, options)
        : createSocketClient(serverUrl, { ...options, auth });
    clients.push(client);
    return client;
  }

  it.each([
    ['missing token', undefined],
    ['malformed token', { token: 'not-a-jwt' }],
    ['invalid signature', { token: token(USER_A, OTHER_SECRET) }],
    [
      'expired token',
      {
        token: jsonwebtoken.sign({}, SECRET, {
          algorithm: 'HS256',
          subject: USER_A,
          expiresIn: -1,
        }),
      },
    ],
  ])('rejects a connection with a %s generically', async (_caseName, auth) => {
    const client = clientWithAuth(auth);

    await expect(connectionError(client)).resolves.toMatchObject({
      message: SOCKET_AUTHENTICATION_ERROR,
    });
    expect(client.connected).toBe(false);
  });

  it('does not accept a JWT from the URL query string', async () => {
    const client = createSocketClient(serverUrl, {
      query: { token: token(USER_A) },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);

    await expect(connectionError(client)).resolves.toMatchObject({
      message: SOCKET_AUTHENTICATION_ERROR,
    });
  });

  it('connects a valid token and associates the socket with the JWT subject', async () => {
    const client = clientWithAuth({ token: token(USER_A) });

    await connect(client);

    const serverSocket = [...socketServer.sockets.sockets.values()][0];
    expect(serverSocket?.data.userId).toBe(USER_A);
    expect(serverSocket?.rooms.has(userRoom(USER_A))).toBe(true);
  });

  it('shares the existing HTTP server and configured port', async () => {
    const response = await fetch(serverUrl);
    const client = clientWithAuth({ token: token(USER_A) });

    await connect(client);

    expect(response.status).toBe(204);
    expect(client.connected).toBe(true);
  });

  it('isolates user rooms, ignores client room requests, and supports multiple sockets', async () => {
    const userAFirst = clientWithAuth({ token: token(USER_A) });
    const userASecond = clientWithAuth({ token: token(USER_A) });
    const userB = clientWithAuth({ token: token(USER_B) });
    await Promise.all([connect(userAFirst), connect(userASecond), connect(userB)]);

    userAFirst.emit('join-room', userRoom(USER_B));
    await delay(20);

    const userAServerSocket = [...socketServer.sockets.sockets.values()].find(
      (socket) => socket.id === userAFirst.id,
    );
    expect(userAServerSocket?.rooms.has(userRoom(USER_B))).toBe(false);

    const bridge = new RealtimeRedisBridge(
      {
        on: () => undefined,
        off: () => undefined,
        subscribe: () => Promise.resolve(1),
        unsubscribe: () => Promise.resolve(0),
      },
      'sentinel:realtime:v1',
      socketServer,
      pino({ enabled: false }),
    );
    const eventForA: RealtimeDomainEvent = {
      version: 1,
      eventId: `check:${CHECK_RESULT_ID}`,
      userId: USER_A,
      type: 'check.completed',
      occurredAt: '2026-01-01T00:00:01.000Z',
      payload: {
        checkResultId: CHECK_RESULT_ID,
        monitorId: MONITOR_ID,
        region: 'mumbai',
        scheduledAt: '2026-01-01T00:00:00.000Z',
        success: true,
        statusCode: 200,
        latencyMs: 100,
        errorType: null,
      },
    };
    let userBEventCount = 0;
    userB.on('check.completed', () => {
      userBEventCount += 1;
    });
    const firstReceived = nextCheckEvent(userAFirst);
    const secondReceived = nextCheckEvent(userASecond);

    bridge.handleMessage(JSON.stringify(eventForA));

    await expect(Promise.all([firstReceived, secondReceived])).resolves.toEqual([
      eventForA.payload,
      eventForA.payload,
    ]);
    await delay(30);
    expect(userBEventCount).toBe(0);

    let userAEventCount = 0;
    userAFirst.on('check.completed', () => {
      userAEventCount += 1;
    });
    userASecond.on('check.completed', () => {
      userAEventCount += 1;
    });
    const eventForB = { ...eventForA, userId: USER_B };
    const userBReceived = nextCheckEvent(userB);

    bridge.handleMessage(JSON.stringify(eventForB));

    await expect(userBReceived).resolves.toEqual(eventForB.payload);
    await delay(30);
    expect(userAEventCount).toBe(0);
    expect(eventForA.payload).not.toHaveProperty('userId');
  });
});
