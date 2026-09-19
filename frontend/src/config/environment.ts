import { z } from 'zod';

const backendUrlSchema = z
  .string({ error: 'VITE_BACKEND_URL is required' })
  .trim()
  .min(1, 'VITE_BACKEND_URL is required')
  .transform((value, context) => {
    try {
      return new URL(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'VITE_BACKEND_URL must be an absolute URL',
      });
      return z.NEVER;
    }
  })
  .refine((url) => url.protocol === 'http:' || url.protocol === 'https:', {
    message: 'VITE_BACKEND_URL must use http: or https:',
  })
  .transform((url) => url.toString().replace(/\/+$/, ''));

export interface FrontendEnvironment {
  apiBaseUrl: string;
  backendUrl: string;
}

export class FrontendEnvironmentError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'FrontendEnvironmentError';
  }
}

export function parseFrontendEnvironment(
  input: Pick<ImportMetaEnv, 'VITE_BACKEND_URL'>,
): FrontendEnvironment {
  const result = backendUrlSchema.safeParse(input.VITE_BACKEND_URL);

  if (!result.success) {
    throw new FrontendEnvironmentError(result.error.issues[0]?.message ?? 'Frontend configuration is invalid');
  }

  return {
    backendUrl: result.data,
    apiBaseUrl: `${result.data}/api/v1`,
  };
}

export function getFrontendEnvironment(): FrontendEnvironment {
  return parseFrontendEnvironment(import.meta.env);
}
