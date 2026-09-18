import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'must be a 24-character hexadecimal identifier');

export const monitorAiParamsSchema = z.strictObject({ monitorId: objectIdSchema });
export const incidentAiParamsSchema = z.strictObject({ incidentId: objectIdSchema });
export const analysisParamsSchema = z.strictObject({ analysisId: objectIdSchema });

export const monitorAiRequestSchema = z
  .strictObject({
    lookbackHours: z.number().int().min(1).max(168).default(24),
  })
  .default({ lookbackHours: 24 });
