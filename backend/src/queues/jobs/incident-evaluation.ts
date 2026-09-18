import { z } from 'zod';

export const INCIDENT_EVALUATION_JOB_NAME = 'evaluate-check-result' as const;

export const incidentEvaluationJobPayloadSchema = z
  .object({
    checkResultId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, 'must be a 24-character hexadecimal identifier'),
  })
  .strict();

export type IncidentEvaluationJobPayload = z.infer<
  typeof incidentEvaluationJobPayloadSchema
>;

export function createIncidentEvaluationJobId(
  input: IncidentEvaluationJobPayload,
): string {
  const payload = incidentEvaluationJobPayloadSchema.parse(input);
  return `incident-eval-${payload.checkResultId}`;
}
