import 'dotenv/config';

import { z } from 'zod';

const booleanStringSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

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
    JWT_EXPIRES_IN: z.string().trim().min(1),
    CLIENT_ORIGIN: z.url(),
    ENABLED_REGIONS: commaSeparatedRegionsSchema,
    PROBE_REGION: z.string().trim().min(1),
    PROBE_CONCURRENCY: z.coerce.number().int().positive(),
    SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().positive(),
    GLOBAL_CHECK_TIMEOUT_MS: z.coerce.number().int().positive(),
    MAX_RESPONSE_BODY_BYTES: z.coerce.number().int().positive(),
    ALLOW_PRIVATE_NETWORK_TARGETS: booleanStringSchema,
    AI_ENABLED: booleanStringSchema,
    OPENAI_API_KEY: z.string().trim().min(1),
    OPENAI_MODEL: z.string().trim().min(1),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
  })
  .superRefine((environment, context) => {
    if (!environment.ENABLED_REGIONS.includes(environment.PROBE_REGION)) {
      context.addIssue({
        code: 'custom',
        path: ['PROBE_REGION'],
        message: 'must be included in ENABLED_REGIONS',
      });
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
