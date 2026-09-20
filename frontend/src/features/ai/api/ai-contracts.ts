import { z } from 'zod';

export const AI_FAILURE_CODES = [
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_OUTPUT',
  'AI_CONTEXT_UNAVAILABLE',
  'AI_RESOURCE_NOT_FOUND',
  'AI_QUEUE_PUBLISH_FAILED',
] as const;

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'must be a MongoDB object id');
const timestampSchema = z.iso.datetime({ offset: true });
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const boundedFindings = z.array(boundedText(500)).max(10);
const requiredCaveats = z.array(boundedText(500)).min(1).max(10);

export const aiFailureCodeSchema = z.enum(AI_FAILURE_CODES);

export const monitorHealthAiResultSchema = z.strictObject({
  summary: boundedText(1_500),
  observations: boundedFindings,
  regionalFindings: boundedFindings,
  latencyFindings: boundedFindings,
  reliabilityRisk: z.enum(['low', 'medium', 'high', 'unknown']),
  caveats: requiredCaveats,
});

export const incidentAiResultSchema = z.strictObject({
  summary: boundedText(1_500),
  timelineSummary: boundedText(1_500),
  affectedRegions: z.array(boundedText(100)).max(10),
  likelyPattern: boundedText(1_000),
  evidence: boundedFindings,
  caveats: requiredCaveats,
});

const inputWindowSchema = z
  .strictObject({
    from: timestampSchema,
    to: timestampSchema,
  })
  .refine((window) => new Date(window.from) <= new Date(window.to), {
    message: 'from must be earlier than or equal to to',
  });

const timestampsShape = {
  inputWindow: inputWindowSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
} as const;

const monitorResourceShape = {
  id: objectIdSchema,
  type: z.literal('monitor_health'),
  monitorId: objectIdSchema,
  incidentId: z.null(),
  ...timestampsShape,
} as const;

const incidentResourceShape = {
  id: objectIdSchema,
  type: z.literal('incident_summary'),
  monitorId: objectIdSchema,
  incidentId: objectIdSchema,
  ...timestampsShape,
} as const;

const activeShape = {
  result: z.null(),
  failureCode: z.null(),
  completedAt: z.null(),
} as const;

const monitorQueuedSchema = z.strictObject({
  ...monitorResourceShape,
  status: z.literal('queued'),
  ...activeShape,
});
const monitorProcessingSchema = z.strictObject({
  ...monitorResourceShape,
  status: z.literal('processing'),
  ...activeShape,
});
const monitorCompletedSchema = z.strictObject({
  ...monitorResourceShape,
  status: z.literal('completed'),
  result: monitorHealthAiResultSchema,
  failureCode: z.null(),
  completedAt: timestampSchema,
});
const monitorFailedSchema = z.strictObject({
  ...monitorResourceShape,
  status: z.literal('failed'),
  result: z.null(),
  failureCode: aiFailureCodeSchema,
  completedAt: timestampSchema,
});

const incidentQueuedSchema = z.strictObject({
  ...incidentResourceShape,
  status: z.literal('queued'),
  ...activeShape,
});
const incidentProcessingSchema = z.strictObject({
  ...incidentResourceShape,
  status: z.literal('processing'),
  ...activeShape,
});
const incidentCompletedSchema = z.strictObject({
  ...incidentResourceShape,
  status: z.literal('completed'),
  result: incidentAiResultSchema,
  failureCode: z.null(),
  completedAt: timestampSchema,
});
const incidentFailedSchema = z.strictObject({
  ...incidentResourceShape,
  status: z.literal('failed'),
  result: z.null(),
  failureCode: aiFailureCodeSchema,
  completedAt: timestampSchema,
});

export const aiAnalysisSchema = z.union([
  monitorQueuedSchema,
  monitorProcessingSchema,
  monitorCompletedSchema,
  monitorFailedSchema,
  incidentQueuedSchema,
  incidentProcessingSchema,
  incidentCompletedSchema,
  incidentFailedSchema,
]);

export const aiAnalysisResponseSchema = z.strictObject({ analysis: aiAnalysisSchema });

export type AiFailureCode = z.infer<typeof aiFailureCodeSchema>;
export type MonitorHealthAiResult = z.infer<typeof monitorHealthAiResultSchema>;
export type IncidentAiResult = z.infer<typeof incidentAiResultSchema>;
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

