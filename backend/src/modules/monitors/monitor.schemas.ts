import { z } from 'zod';

import { MONITOR_METHODS } from '../../database/models/monitor';

export const MONITOR_LIMITS = {
  nameLength: 100,
  urlLength: 2_048,
  intervalSeconds: { min: 10, max: 86_400 },
  timeoutMs: { min: 100, max: 30_000 },
  expectedStatusCodes: { min: 1, max: 20, lowest: 100, highest: 599 },
  latencyThresholdMs: { min: 1, max: 60_000 },
  consecutiveThreshold: { min: 1, max: 10 },
} as const;

function normalizeUrl(value: string, context: z.RefinementCtx): string | typeof z.NEVER {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'must be a valid absolute URL' });
    return z.NEVER;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    context.addIssue({ code: 'custom', message: 'must use the http or https protocol' });
    return z.NEVER;
  }

  if (url.username || url.password) {
    context.addIssue({ code: 'custom', message: 'must not include credentials' });
    return z.NEVER;
  }

  return url.toString();
}

const monitorUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(MONITOR_LIMITS.urlLength)
  .transform(normalizeUrl);

const expectedStatusCodesSchema = z
  .array(
    z
      .number()
      .int()
      .min(MONITOR_LIMITS.expectedStatusCodes.lowest)
      .max(MONITOR_LIMITS.expectedStatusCodes.highest),
  )
  .min(MONITOR_LIMITS.expectedStatusCodes.min)
  .max(MONITOR_LIMITS.expectedStatusCodes.max)
  .refine((values) => new Set(values).size === values.length, {
    message: 'must not contain duplicate status codes',
  });

function createRegionsSchema(enabledRegions: readonly string[]): z.ZodType<string[]> {
  const enabledRegionSet = new Set(enabledRegions);

  return z
    .array(z.string().trim().min(1))
    .min(1)
    .max(enabledRegions.length)
    .refine((regions) => new Set(regions).size === regions.length, {
      message: 'must not contain duplicate regions',
    })
    .refine((regions) => regions.every((region) => enabledRegionSet.has(region)), {
      message: 'contains a region that is not enabled',
    });
}

const monitorIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid monitor id');

export const monitorIdParamsSchema = z.strictObject({ monitorId: monitorIdSchema });

export function createMonitorSchemas(enabledRegions: readonly string[]) {
  const configurationShape = {
    name: z.string().trim().min(1).max(MONITOR_LIMITS.nameLength),
    url: monitorUrlSchema,
    method: z.enum(MONITOR_METHODS),
    intervalSeconds: z
      .number()
      .int()
      .min(MONITOR_LIMITS.intervalSeconds.min)
      .max(MONITOR_LIMITS.intervalSeconds.max),
    timeoutMs: z
      .number()
      .int()
      .min(MONITOR_LIMITS.timeoutMs.min)
      .max(MONITOR_LIMITS.timeoutMs.max),
    expectedStatusCodes: expectedStatusCodesSchema,
    latencyThresholdMs: z
      .number()
      .int()
      .min(MONITOR_LIMITS.latencyThresholdMs.min)
      .max(MONITOR_LIMITS.latencyThresholdMs.max),
    failureThreshold: z
      .number()
      .int()
      .min(MONITOR_LIMITS.consecutiveThreshold.min)
      .max(MONITOR_LIMITS.consecutiveThreshold.max),
    recoveryThreshold: z
      .number()
      .int()
      .min(MONITOR_LIMITS.consecutiveThreshold.min)
      .max(MONITOR_LIMITS.consecutiveThreshold.max),
    regions: createRegionsSchema(enabledRegions),
  };

  const createBodySchema = z.strictObject(configurationShape);
  const updateBodySchema = z
    .strictObject({
      name: configurationShape.name.optional(),
      url: configurationShape.url.optional(),
      method: configurationShape.method.optional(),
      intervalSeconds: configurationShape.intervalSeconds.optional(),
      timeoutMs: configurationShape.timeoutMs.optional(),
      expectedStatusCodes: configurationShape.expectedStatusCodes.optional(),
      latencyThresholdMs: configurationShape.latencyThresholdMs.optional(),
      failureThreshold: configurationShape.failureThreshold.optional(),
      recoveryThreshold: configurationShape.recoveryThreshold.optional(),
      regions: configurationShape.regions.optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'must include at least one mutable monitor field',
    });

  return { createBodySchema, updateBodySchema };
}

export type CreateMonitorInput = z.infer<
  ReturnType<typeof createMonitorSchemas>['createBodySchema']
>;
export type UpdateMonitorInput = z.infer<
  ReturnType<typeof createMonitorSchemas>['updateBodySchema']
>;
