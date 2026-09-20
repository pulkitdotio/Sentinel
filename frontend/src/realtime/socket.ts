import { io, type Socket } from 'socket.io-client';

import { getFrontendEnvironment } from '../config/environment';
import type { ClientToServerEvents, ServerToClientEvents } from './realtime-contracts';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createRealtimeSocket(accessToken: string): RealtimeSocket {
  const { backendUrl } = getFrontendEnvironment();

  const socket: RealtimeSocket = io(backendUrl, {
    auth: { token: accessToken },
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000,
    timeout: 10_000,
  });

  return socket;
}
