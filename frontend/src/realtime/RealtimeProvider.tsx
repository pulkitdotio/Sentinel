import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { getAuthToken, subscribeToAuthToken } from '../auth/auth-token';
import {
  checkCompletedEventSchema,
  incidentOpenedEventSchema,
  incidentResolvedEventSchema,
  monitorStatusChangedEventSchema,
} from './realtime-contracts';
import { RealtimeContext, type RealtimeConnectionStatus } from './realtime-context';
import {
  patchMonitorStatus,
  reconcileAfterReconnect,
  refreshAfterCheck,
  refreshAfterIncidentOpened,
  refreshAfterIncidentResolved,
  refreshAfterStatusChange,
} from './query-invalidation';
import { createRealtimeSocket } from './socket';

const CHECK_INVALIDATION_DELAY_MS = 350;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const accessToken = useSyncExternalStore(subscribeToAuthToken, getAuthToken, () => null);

  return (
    <RealtimeConnection key={accessToken ?? 'no-token'} accessToken={accessToken}>
      {children}
    </RealtimeConnection>
  );
}

function RealtimeConnection({
  accessToken,
  children,
}: {
  accessToken: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeConnectionStatus>(
    accessToken ? 'reconnecting' : 'disconnected',
  );

  useEffect(() => {
    if (!accessToken) return;

    const checkTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const socket = createRealtimeSocket(accessToken);
    let connectedBefore = false;
    let reconciliationNeeded = false;
    let disposed = false;

    const handleConnect = () => {
      if (disposed) return;
      setStatus('connected');

      if (connectedBefore && reconciliationNeeded) {
        reconciliationNeeded = false;
        void reconcileAfterReconnect(queryClient);
      }

      connectedBefore = true;
    };

    const handleDisconnect = () => {
      if (disposed) return;
      if (connectedBefore) reconciliationNeeded = true;
      setStatus(socket.active ? 'reconnecting' : 'disconnected');
    };

    const handleConnectError = () => {
      if (disposed) return;
      setStatus(socket.active ? 'reconnecting' : 'disconnected');
    };

    const handleCheckCompleted = (payload: unknown) => {
      const parsed = checkCompletedEventSchema.safeParse(payload);
      if (!parsed.success || checkTimers.has(parsed.data.monitorId)) return;

      const monitorId = parsed.data.monitorId;
      const timer = setTimeout(() => {
        checkTimers.delete(monitorId);
        void refreshAfterCheck(queryClient, monitorId);
      }, CHECK_INVALIDATION_DELAY_MS);
      checkTimers.set(monitorId, timer);
    };

    const handleMonitorStatusChanged = (payload: unknown) => {
      const parsed = monitorStatusChangedEventSchema.safeParse(payload);
      if (!parsed.success) return;

      patchMonitorStatus(queryClient, parsed.data);
      void refreshAfterStatusChange(queryClient, parsed.data.monitorId);
    };

    const handleIncidentOpened = (payload: unknown) => {
      const parsed = incidentOpenedEventSchema.safeParse(payload);
      if (!parsed.success) return;
      void refreshAfterIncidentOpened(queryClient, parsed.data.monitorId);
    };

    const handleIncidentResolved = (payload: unknown) => {
      const parsed = incidentResolvedEventSchema.safeParse(payload);
      if (!parsed.success) return;
      void refreshAfterIncidentResolved(queryClient, parsed.data.monitorId, parsed.data.incidentId);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('check.completed', handleCheckCompleted);
    socket.on('monitor.status_changed', handleMonitorStatusChanged);
    socket.on('incident.opened', handleIncidentOpened);
    socket.on('incident.resolved', handleIncidentResolved);

    return () => {
      disposed = true;
      checkTimers.forEach((timer) => clearTimeout(timer));
      checkTimers.clear();
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('check.completed', handleCheckCompleted);
      socket.off('monitor.status_changed', handleMonitorStatusChanged);
      socket.off('incident.opened', handleIncidentOpened);
      socket.off('incident.resolved', handleIncidentResolved);
      socket.disconnect();
    };
  }, [accessToken, queryClient]);

  const value = useMemo(() => ({ status }), [status]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
