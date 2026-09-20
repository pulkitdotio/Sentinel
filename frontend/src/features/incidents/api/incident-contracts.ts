import { z } from 'zod';

import { paginationSchema } from '../../../api/contracts';
import { checkErrorTypeSchema } from '../../checks/api/check-error-contract';

export const incidentStatusSchema = z.enum(['open', 'resolved']);
export const incidentEventTypeSchema = z.enum(['opened', 'resolved']);

export const incidentSchema = z.strictObject({
  id: z.string().min(1),
  userId: z.string().min(1),
  monitorId: z.string().min(1),
  status: incidentStatusSchema,
  openedAt: z.string(),
  resolvedAt: z.string().nullable(),
  triggerReason: z.string(),
  openingStatusEvidence: z.strictObject({
    requiredConsensus: z.number().int().positive(),
    failureThreshold: z.number().int().positive(),
    regions: z.array(z.strictObject({
      region: z.string(),
      consecutiveFailures: z.number().int().positive(),
      latestErrorType: checkErrorTypeSchema.nullable(),
    })).min(1).max(20),
  }),
  events: z.array(z.strictObject({
    type: incidentEventTypeSchema,
    at: z.string(),
    message: z.string(),
  })).min(1).max(2),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const incidentListResponseSchema = z.strictObject({
  incidents: z.array(incidentSchema),
  pagination: paginationSchema,
});

export const incidentResponseSchema = z.strictObject({ incident: incidentSchema });

export type Incident = z.infer<typeof incidentSchema>;
export type IncidentPage = z.infer<typeof incidentListResponseSchema>;
