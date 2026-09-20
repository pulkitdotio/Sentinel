import { z } from 'zod';

import { checkErrorTypeSchema } from '../features/checks/api/check-error-contract';
import { MONITOR_STATUSES } from '../features/monitors/api/monitor-contracts';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'must be a MongoDB object id');
const timestampSchema = z.iso.datetime({ offset: true });
const regionIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const checkCompletedEventSchema = z.strictObject({
  checkResultId: objectIdSchema,
  monitorId: objectIdSchema,
  region: regionIdentifierSchema,
  scheduledAt: timestampSchema,
  success: z.boolean(),
  statusCode: z.number().int().min(100).max(599).nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  errorType: checkErrorTypeSchema.nullable(),
});

export const monitorStatusChangedEventSchema = z
  .strictObject({
    monitorId: objectIdSchema,
    previousStatus: z.enum(MONITOR_STATUSES),
    status: z.enum(MONITOR_STATUSES),
    changedAt: timestampSchema,
  })
  .refine((payload) => payload.previousStatus !== payload.status, {
    message: 'previousStatus and status must differ',
  });

export const incidentOpenedEventSchema = z.strictObject({
  incidentId: objectIdSchema,
  monitorId: objectIdSchema,
  status: z.literal('open'),
  openedAt: timestampSchema,
  triggerReason: z.string().trim().min(1).max(100),
});

export const incidentResolvedEventSchema = z.strictObject({
  incidentId: objectIdSchema,
  monitorId: objectIdSchema,
  status: z.literal('resolved'),
  openedAt: timestampSchema,
  resolvedAt: timestampSchema,
  durationMs: z.number().int().nonnegative().nullable(),
  triggerReason: z.string().trim().min(1).max(100),
});

export type CheckCompletedEvent = z.infer<typeof checkCompletedEventSchema>;
export type MonitorStatusChangedEvent = z.infer<typeof monitorStatusChangedEventSchema>;
export type IncidentOpenedEvent = z.infer<typeof incidentOpenedEventSchema>;
export type IncidentResolvedEvent = z.infer<typeof incidentResolvedEventSchema>;

export interface ServerToClientEvents {
  'check.completed': (payload: CheckCompletedEvent) => void;
  'monitor.status_changed': (payload: MonitorStatusChangedEvent) => void;
  'incident.opened': (payload: IncidentOpenedEvent) => void;
  'incident.resolved': (payload: IncidentResolvedEvent) => void;
}

export type ClientToServerEvents = Record<never, never>;
