import type { ZodType } from 'zod';

import { clearAuthToken, getAuthToken } from '../auth/auth-token';
import { FrontendEnvironmentError, getFrontendEnvironment } from '../config/environment';

interface BackendErrorEnvelope {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
}

export interface ApiErrorShape {
  code: string;
  details?: unknown;
  message: string;
  status: number | null;
}

export class ApiError extends Error implements ApiErrorShape {
  public constructor(
    public readonly status: number | null,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions<TResponse> {
  body?: unknown;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  responseSchema?: ZodType<TResponse>;
}

export interface HttpClient {
  request<TResponse>(path: string, options?: RequestOptions<TResponse>): Promise<TResponse>;
}

interface HttpClientDependencies {
  fetchImplementation?: typeof fetch;
  getToken?: () => string | null;
  onAuthenticationRejected?: () => void;
}

function isAuthenticationRejection(status: number, code: string): boolean {
  return status === 401 && (code === 'INVALID_TOKEN' || code === 'AUTHENTICATION_REQUIRED');
}

function isBackendErrorEnvelope(value: unknown): value is BackendErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const responseText = await response.text();
  if (responseText.length === 0) return undefined;

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an unreadable response');
  }
}

export function createHttpClient({
  fetchImplementation,
  getToken = getAuthToken,
  onAuthenticationRejected = clearAuthToken,
}: HttpClientDependencies = {}): HttpClient {
  return {
    async request<TResponse>(path: string, options: RequestOptions<TResponse> = {}): Promise<TResponse> {
      let apiBaseUrl: string;

      try {
        apiBaseUrl = getFrontendEnvironment().apiBaseUrl;
      } catch (error: unknown) {
        if (error instanceof FrontendEnvironmentError) {
          throw new ApiError(null, 'CONFIGURATION_ERROR', error.message);
        }
        throw error;
      }

      const token = getToken();
      const headers = new Headers({ Accept: 'application/json' });
      if (options.body !== undefined) headers.set('Content-Type', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);

      let response: Response;
      try {
        response = await (fetchImplementation ?? fetch)(`${apiBaseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
      } catch {
        throw new ApiError(null, 'NETWORK_ERROR', 'Unable to reach Sentinel. Check your connection and try again.');
      }

      const data = await parseResponseBody(response);

      if (!response.ok) {
        if (isBackendErrorEnvelope(data)) {
          if (token && isAuthenticationRejection(response.status, data.error.code)) {
            onAuthenticationRejected();
          }
          throw new ApiError(response.status, data.error.code, data.error.message, data.error.details);
        }

        throw new ApiError(response.status, 'REQUEST_FAILED', 'Sentinel could not complete the request');
      }

      if (!options.responseSchema) return data as TResponse;

      const parsed = options.responseSchema.safeParse(data);
      if (!parsed.success) {
        throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an unexpected response');
      }

      return parsed.data;
    },
  };
}

export const httpClient = createHttpClient();
