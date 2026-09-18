import 'dotenv/config';

import { z } from 'zod';

import { regionIdentifierSchema } from '../shared/schemas/region';

const booleanStringSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalTrimmedStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalPositiveIntegerSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
).catch(undefined);

const OPENAI_KEY_PLACEHOLDER = 'replace-with-provider-key';
const OPENAI_MODEL_PLACEHOLDER = 'replace-with-supported-model';

const commaSeparatedRegionsSchema = z.string().transform((value, context) => {
  const regions = value
    .split(',')
    .map((region) => region.trim())
    .filter((region) => region.length > 0);

  if (regions.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'must contain at least one region',
    });

    return z.NEVER;
  }

  if (new Set(regions).size !== regions.length) {
    context.addIssue({
      code: 'custom',
      message: 'must not contain duplicate regions',
    });

    return z.NEVER;
  }

  const invalidRegion = regions.find(
    (region) => !regionIdentifierSchema.safeParse(region).success,
  );

  if (invalidRegion) {
    context.addIssue({
      code: 'custom',
      message: `contains invalid region identifier: ${invalidRegion}`,
    });

    return z.NEVER;
  }

  return regions;
});

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().min(1).max(65_535),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//, 'must be a MongoDB URI'),
    REDIS_URL: z.url().refine((url) => ['redis:', 'rediss:'].includes(new URL(url).protocol), {
      message: 'must be a Redis URL',
    }),
    BULLMQ_PREFIX: z.string().trim().min(1),
    JWT_SECRET: z.string().min(16, 'must contain at least 16 characters'),
    JWT_EXPIRES_IN: z
      .string()
      .trim()
      .regex(/^[1-9]\d*[smhdw]$/, 'must be a positive duration such as 30m, 12h, or 7d'),
    CLIENT_ORIGIN: z.url(),
    ENABLED_REGIONS: commaSeparatedRegionsSchema,
    PROBE_REGION: regionIdentifierSchema,
    PROBE_CONCURRENCY: z.coerce.number().int().positive(),
    SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().positive(),
    GLOBAL_CHECK_TIMEOUT_MS: z.coerce.number().int().positive(),
    MAX_RESPONSE_BODY_BYTES: z.coerce.number().int().positive(),
    ALLOW_PRIVATE_NETWORK_TARGETS: booleanStringSchema,
    AI_ENABLED: booleanStringSchema,
    OPENAI_API_KEY: optionalTrimmedStringSchema,
    OPENAI_MODEL: optionalTrimmedStringSchema,
    AI_REQUEST_TIMEOUT_MS: optionalPositiveIntegerSchema,
  })
  .superRefine((environment, context) => {
    if (!environment.ENABLED_REGIONS.includes(environment.PROBE_REGION)) {
      context.addIssue({
        code: 'custom',
        path: ['PROBE_REGION'],
        message: 'must be included in ENABLED_REGIONS',
      });
    }

    if (environment.AI_ENABLED) {
      if (
        environment.OPENAI_API_KEY === undefined ||
        environment.OPENAI_API_KEY === OPENAI_KEY_PLACEHOLDER
      ) {
        context.addIssue({
          code: 'custom',
          path: ['OPENAI_API_KEY'],
          message: 'must contain a non-placeholder key when AI_ENABLED=true',
        });
      }

      if (
        environment.OPENAI_MODEL === undefined ||
        environment.OPENAI_MODEL === OPENAI_MODEL_PLACEHOLDER
      ) {
        context.addIssue({
          code: 'custom',
          path: ['OPENAI_MODEL'],
          message: 'must contain a non-placeholder model when AI_ENABLED=true',
        });
      }

      if (environment.AI_REQUEST_TIMEOUT_MS === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['AI_REQUEST_TIMEOUT_MS'],
          message: 'is required when AI_ENABLED=true',
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export class EnvironmentValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'environment';
      return `${path}: ${issue.message}`;
    });

    throw new EnvironmentValidationError(issues);
  }

  return result.data;
}

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  cachedEnvironment ??= parseEnvironment(process.env);
  return cachedEnvironment;
}
