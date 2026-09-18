import { z } from 'zod';

export const AI_ANALYSIS_JOB_NAME = 'analyze' as const;

export const aiAnalysisJobPayloadSchema = z
  .object({
    analysisId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, 'must be a 24-character hexadecimal identifier'),
  })
  .strict();

export type AiAnalysisJobPayload = z.infer<typeof aiAnalysisJobPayloadSchema>;

export function createAiAnalysisJobId(input: AiAnalysisJobPayload): string {
  const payload = aiAnalysisJobPayloadSchema.parse(input);
  return `ai-analysis-${payload.analysisId}`;
}
