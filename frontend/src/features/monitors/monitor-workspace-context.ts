import { createContext, useContext } from 'react';

import type { Monitor } from './api/monitor-contracts';

export const MonitorWorkspaceContext = createContext<Monitor | null>(null);

export function useMonitorWorkspace(): Monitor {
  const monitor = useContext(MonitorWorkspaceContext);
  if (monitor === null) throw new Error('useMonitorWorkspace must be used within a monitor workspace');
  return monitor;
}
