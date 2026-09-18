import { z } from 'zod';

import { regionIdentifierSchema } from '../../shared/schemas/region';
import { timeRangeQueryShape } from './time-range';

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'must be a 24-character hexadecimal identifier');

export const metricsMonitorParamsSchema = z.strictObject({ monitorId: objectIdSchema });

export const checkHistoryQuerySchema = z.strictObject({
  ...timeRangeQueryShape,
  region: regionIdentifierSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CheckHistoryQuery = z.infer<typeof checkHistoryQuerySchema>;
