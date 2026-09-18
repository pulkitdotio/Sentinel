import type { Server as HttpServer } from 'node:http';

import { Server } from 'socket.io';
import { z } from 'zod';

import { verifyAccessToken, type JwtConfiguration } from '../../modules/auth/jwt';
import type { ServerToClientEvents } from '../../realtime/events';

export const SOCKET_AUTHENTICATION_ERROR = 'Authentication failed';

interface ClientToServerEvents {
  [event: string]: never;
}

interface InterServerEvents {
  [event: string]: never;
}

export interface RealtimeSocketData {
  userId: string;
}

export type RealtimeSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  RealtimeSocketData
>;

const socketAuthenticationSchema = z.object({ token: z.string().min(1) }).strict();

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function attachSocketServer(
  httpServer: HttpServer,
  clientOrigin: string,
  jwtConfiguration: JwtConfiguration,
): RealtimeSocketServer {
  const io: RealtimeSocketServer = new Server(httpServer, {
    cors: { origin: clientOrigin },
  });

  io.use((socket, next) => {
    const authentication = socketAuthenticationSchema.safeParse(socket.handshake.auth);

    if (!authentication.success) {
      next(new Error(SOCKET_AUTHENTICATION_ERROR));
      return;
    }

    try {
      socket.data.userId = verifyAccessToken(
        authentication.data.token,
        jwtConfiguration,
      );
      next();
    } catch {
      next(new Error(SOCKET_AUTHENTICATION_ERROR));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(userRoom(socket.data.userId));
  });

  return io;
}
