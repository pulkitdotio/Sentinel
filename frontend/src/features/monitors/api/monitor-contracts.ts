import { z } from 'zod';

export const MONITOR_METHODS = ['GET', 'HEAD'] as const;
export const MONITOR_STATUSES = ['pending', 'healthy', 'degraded', 'down', 'paused'] as const;
export const MONITOR_REGIONS = ['mumbai', 'singapore', 'frankfurt'] as const;

export const monitorSchema = z.strictObject({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string(),
  url: z.string(),
  method: z.enum(MONITOR_METHODS),
  intervalSeconds: z.number().int(),
  timeoutMs: z.number().int(),
  expectedStatusCodes: z.array(z.number().int()),
  latencyThresholdMs: z.number().int(),
  failureThreshold: z.number().int(),
  recoveryThreshold: z.number().int(),
  regions: z.array(z.string()),
  isPaused: z.boolean(),
  status: z.enum(MONITOR_STATUSES),
  nextCheckAt: z.string(),
  lastCheckedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const monitorResponseSchema = z.strictObject({ monitor: monitorSchema });
export const monitorListResponseSchema = z.strictObject({ monitors: z.array(monitorSchema) });

export type Monitor = z.infer<typeof monitorSchema>;
export type MonitorMethod = (typeof MONITOR_METHODS)[number];
export type MonitorStatus = (typeof MONITOR_STATUSES)[number];
export type MonitorRegion = (typeof MONITOR_REGIONS)[number];

export interface MonitorConfiguration {
  name: string;
  url: string;
  method: MonitorMethod;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCodes: number[];
  latencyThresholdMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  regions: MonitorRegion[];
}

export type UpdateMonitorRequest = Partial<MonitorConfiguration>;
