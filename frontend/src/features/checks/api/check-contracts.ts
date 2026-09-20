import { z } from 'zod';

import { paginationSchema } from '../../../api/contracts';
import { checkErrorTypeSchema } from './check-error-contract';

export const checkResultSchema = z.strictObject({
  id: z.string().min(1),
  monitorId: z.string().min(1),
  region: z.string(),
  scheduledAt: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  success: z.boolean(),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  errorType: checkErrorTypeSchema.nullable(),
  errorMetadata: z.strictObject({ code: z.string() }).optional(),
});

export const checkHistoryResponseSchema = z.strictObject({
  checks: z.array(checkResultSchema),
  range: z.strictObject({ from: z.string(), to: z.string() }),
  pagination: paginationSchema,
});

export type CheckResult = z.infer<typeof checkResultSchema>;
export type CheckHistoryPage = z.infer<typeof checkHistoryResponseSchema>;
