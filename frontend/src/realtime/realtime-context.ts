import { createContext, useContext } from 'react';

export type RealtimeConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimeContextValue {
  status: RealtimeConnectionStatus;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside RealtimeProvider');
  return context;
}
