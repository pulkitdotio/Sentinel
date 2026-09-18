import { z } from 'zod';

import { regionIdentifierSchema } from '../names';

export const PROBE_JOB_NAME = 'probe' as const;

const objectIdStringSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'must be a 24-character hexadecimal identifier');

const utcIsoTimestampSchema = z.string().refine(
  (value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  },
  { message: 'must be a canonical UTC ISO timestamp' },
);

export const probeJobPayloadSchema = z
  .object({
    monitorId: objectIdStringSchema,
    userId: objectIdStringSchema,
    region: regionIdentifierSchema,
    scheduledAt: utcIsoTimestampSchema,
  })
  .strict();

export type ProbeJobPayload = z.infer<typeof probeJobPayloadSchema>;

export function createProbeJobId(input: ProbeJobPayload): string {
  const payload = probeJobPayloadSchema.parse(input);
  const scheduledAtEpochMs = Date.parse(payload.scheduledAt).toString();
  return `probe-${payload.monitorId}-${payload.region}-${scheduledAtEpochMs}`;
}
