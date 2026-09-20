import { z } from 'zod';

import { monitorSchema } from '../../monitors/api/monitor-contracts';
import { incidentStatusSchema } from '../../incidents/api/incident-contracts';
import { checkErrorTypeSchema } from '../../checks/api/check-error-contract';

const nullableMetricSchema = z.number().finite().nonnegative().nullable();

export const latestCheckSummarySchema = z.strictObject({
  scheduledAt: z.string(),
  success: z.boolean(),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  errorType: checkErrorTypeSchema.nullable(),
});

export const monitorMetricsResponseSchema = z.strictObject({
  monitor: z.strictObject({
    id: z.string().min(1),
    name: z.string(),
    status: monitorSchema.shape.status,
    isPaused: z.boolean(),
    lastCheckedAt: z.string().nullable(),
    regions: z.array(z.string()),
  }),
  range: z.strictObject({ from: z.string(), to: z.string() }),
  totals: z.strictObject({
    checks: z.number().int().nonnegative(),
    successfulChecks: z.number().int().nonnegative(),
    failedChecks: z.number().int().nonnegative(),
  }),
  uptimePercentage: nullableMetricSchema,
  latency: z.strictObject({
    sampleCount: z.number().int().nonnegative(),
    averageMs: nullableMetricSchema,
    p50Ms: nullableMetricSchema,
    p95Ms: nullableMetricSchema,
    p99Ms: nullableMetricSchema,
  }),
  regions: z.array(z.strictObject({
    region: z.string(),
    totalChecks: z.number().int().nonnegative(),
    successfulChecks: z.number().int().nonnegative(),
    failedChecks: z.number().int().nonnegative(),
    uptimePercentage: nullableMetricSchema,
    averageLatencyMs: nullableMetricSchema,
    latestCheck: latestCheckSummarySchema.nullable(),
  })),
  recentIncidents: z.array(z.strictObject({
    id: z.string().min(1),
    status: incidentStatusSchema,
    openedAt: z.string(),
    resolvedAt: z.string().nullable(),
    triggerReason: z.string(),
  })),
});

export type MonitorMetrics = z.infer<typeof monitorMetricsResponseSchema>;
