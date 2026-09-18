import { z } from 'zod';

import { CHECK_ERROR_TYPES } from '../database/models/check-result';
import { MONITOR_STATUSES } from '../database/models/monitor';
import { AI_FAILURE_CODES } from '../modules/ai/ai-contracts';
import { regionIdentifierSchema } from '../shared/schemas/region';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'must be a MongoDB object id');
const timestampSchema = z.iso.datetime({ offset: true });
const eventIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9:._-]+$/, 'contains unsupported characters');

const envelopeSchema = z.object({
  version: z.literal(1),
  eventId: eventIdSchema,
  userId: objectIdSchema,
  occurredAt: timestampSchema,
});

export const checkCompletedPayloadSchema = z
  .object({
    checkResultId: objectIdSchema,
    monitorId: objectIdSchema,
    region: regionIdentifierSchema,
    scheduledAt: timestampSchema,
    success: z.boolean(),
    statusCode: z.number().int().min(100).max(599).nullable(),
    latencyMs: z.number().nonnegative().nullable(),
    errorType: z.enum(CHECK_ERROR_TYPES).nullable(),
  })
  .strict();

export const monitorStatusChangedPayloadSchema = z
  .object({
    monitorId: objectIdSchema,
    previousStatus: z.enum(MONITOR_STATUSES),
    status: z.enum(MONITOR_STATUSES),
    changedAt: timestampSchema,
  })
  .strict()
  .refine((payload) => payload.previousStatus !== payload.status, {
    message: 'previousStatus and status must differ',
  });

export const incidentOpenedPayloadSchema = z
  .object({
    incidentId: objectIdSchema,
    monitorId: objectIdSchema,
    status: z.literal('open'),
    openedAt: timestampSchema,
    triggerReason: z.string().trim().min(1).max(100),
  })
  .strict();

export const incidentResolvedPayloadSchema = z
  .object({
    incidentId: objectIdSchema,
    monitorId: objectIdSchema,
    status: z.literal('resolved'),
    openedAt: timestampSchema,
    resolvedAt: timestampSchema,
    durationMs: z.number().int().nonnegative().nullable(),
    triggerReason: z.string().trim().min(1).max(100),
  })
  .strict();

export const aiAnalysisCompletedPayloadSchema = z
  .object({
    analysisId: objectIdSchema,
    resourceType: z.enum(['monitor', 'incident']),
    resourceId: objectIdSchema,
  })
  .strict();

export const aiAnalysisFailedPayloadSchema = z
  .object({
    analysisId: objectIdSchema,
    resourceType: z.enum(['monitor', 'incident']),
    resourceId: objectIdSchema,
    failureCode: z.enum(AI_FAILURE_CODES),
  })
  .strict();

const checkCompletedEventSchema = envelopeSchema
  .extend({
    type: z.literal('check.completed'),
    payload: checkCompletedPayloadSchema,
  })
  .strict();

const monitorStatusChangedEventSchema = envelopeSchema
  .extend({
    type: z.literal('monitor.status_changed'),
    payload: monitorStatusChangedPayloadSchema,
  })
  .strict();

const incidentOpenedEventSchema = envelopeSchema
  .extend({
    type: z.literal('incident.opened'),
    payload: incidentOpenedPayloadSchema,
  })
  .strict();

const incidentResolvedEventSchema = envelopeSchema
  .extend({
    type: z.literal('incident.resolved'),
    payload: incidentResolvedPayloadSchema,
  })
  .strict();

const aiAnalysisCompletedEventSchema = envelopeSchema
  .extend({
    type: z.literal('ai.analysis.completed'),
    payload: aiAnalysisCompletedPayloadSchema,
  })
  .strict();

const aiAnalysisFailedEventSchema = envelopeSchema
  .extend({
    type: z.literal('ai.analysis.failed'),
    payload: aiAnalysisFailedPayloadSchema,
  })
  .strict();

export const realtimeDomainEventSchema = z.discriminatedUnion('type', [
  checkCompletedEventSchema,
  monitorStatusChangedEventSchema,
  incidentOpenedEventSchema,
  incidentResolvedEventSchema,
  aiAnalysisCompletedEventSchema,
  aiAnalysisFailedEventSchema,
]);

export type CheckCompletedPayload = z.infer<typeof checkCompletedPayloadSchema>;
export type MonitorStatusChangedPayload = z.infer<
  typeof monitorStatusChangedPayloadSchema
>;
export type IncidentOpenedPayload = z.infer<typeof incidentOpenedPayloadSchema>;
export type IncidentResolvedPayload = z.infer<typeof incidentResolvedPayloadSchema>;
export type AiAnalysisCompletedPayload = z.infer<
  typeof aiAnalysisCompletedPayloadSchema
>;
export type AiAnalysisFailedPayload = z.infer<typeof aiAnalysisFailedPayloadSchema>;
export type RealtimeDomainEvent = z.infer<typeof realtimeDomainEventSchema>;

export interface ServerToClientEvents {
  'check.completed': (payload: CheckCompletedPayload) => void;
  'monitor.status_changed': (payload: MonitorStatusChangedPayload) => void;
  'incident.opened': (payload: IncidentOpenedPayload) => void;
  'incident.resolved': (payload: IncidentResolvedPayload) => void;
  'ai.analysis.completed': (payload: AiAnalysisCompletedPayload) => void;
  'ai.analysis.failed': (payload: AiAnalysisFailedPayload) => void;
}

export function checkCompletedEventId(checkResultId: string): string {
  return `check:${checkResultId}`;
}

export function monitorStatusChangedEventId(
  monitorId: string,
  previousStatus: string,
  status: string,
  changedAt: Date,
): string {
  return `monitor-status:${monitorId}:${previousStatus}:${status}:${String(changedAt.getTime())}`;
}

export function incidentOpenedEventId(incidentId: string): string {
  return `incident-opened:${incidentId}`;
}

export function incidentResolvedEventId(incidentId: string): string {
  return `incident-resolved:${incidentId}`;
}

export function aiAnalysisCompletedEventId(analysisId: string): string {
  return `ai-completed-${analysisId}`;
}

export function aiAnalysisFailedEventId(analysisId: string): string {
  return `ai-failed-${analysisId}`;
}
