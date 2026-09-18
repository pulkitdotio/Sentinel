import { z } from 'zod';

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'must be a 24-character hexadecimal identifier');

export const monitorIncidentParamsSchema = z.object({
  monitorId: objectIdSchema,
});

export const incidentParamsSchema = z.object({
  incidentId: objectIdSchema,
});

export const incidentPaginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type IncidentPagination = z.infer<typeof incidentPaginationSchema>;
