import { z } from 'zod';

export const AI_ANALYSIS_TYPES = ['monitor_health', 'incident_summary'] as const;
export const AI_ANALYSIS_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export const AI_FAILURE_CODES = [
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_OUTPUT',
  'AI_CONTEXT_UNAVAILABLE',
  'AI_RESOURCE_NOT_FOUND',
  'AI_QUEUE_PUBLISH_FAILED',
] as const;

export type AiAnalysisType = (typeof AI_ANALYSIS_TYPES)[number];
export type AiAnalysisStatus = (typeof AI_ANALYSIS_STATUSES)[number];
export type AiFailureCode = (typeof AI_FAILURE_CODES)[number];

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const boundedFindings = z.array(boundedText(500)).max(10);
const requiredCaveats = z.array(boundedText(500)).min(1).max(10);

export const monitorHealthAiResultSchema = z
  .object({
    summary: boundedText(1_500),
    observations: boundedFindings,
    regionalFindings: boundedFindings,
    latencyFindings: boundedFindings,
    reliabilityRisk: z.enum(['low', 'medium', 'high', 'unknown']),
    caveats: requiredCaveats,
  })
  .strict();

export const incidentAiResultSchema = z
  .object({
    summary: boundedText(1_500),
    timelineSummary: boundedText(1_500),
    affectedRegions: z.array(boundedText(100)).max(10),
    likelyPattern: boundedText(1_000),
    evidence: boundedFindings,
    caveats: requiredCaveats,
  })
  .strict();

export const aiAnalysisResultSchema = z.union([
  monitorHealthAiResultSchema,
  incidentAiResultSchema,
]);

export const aiInputWindowSchema = z
  .object({
    from: z.date(),
    to: z.date(),
  })
  .strict()
  .refine((window) => window.from <= window.to, {
    message: 'from must be earlier than or equal to to',
  });

export type MonitorHealthAiResult = z.infer<typeof monitorHealthAiResultSchema>;
export type IncidentAiResult = z.infer<typeof incidentAiResultSchema>;
export type AiAnalysisResult = z.infer<typeof aiAnalysisResultSchema>;
export type AiInputWindow = z.infer<typeof aiInputWindowSchema>;
