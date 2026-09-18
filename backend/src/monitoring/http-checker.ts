import { performance } from 'node:perf_hooks';
import type { Readable } from 'node:stream';

import type { CheckErrorMetadata, CheckErrorType } from '../database/models/check-result';
import type { MonitorMethod } from '../database/models/monitor';
import { classifyCheckError, RedirectError } from './check-error';
import type { HttpTransport, HttpTransportResponse } from './http-transport';
import {
  NodeDnsResolver,
  TargetValidationError,
  type DnsResolver,
  resolveSafeTarget,
} from './ssrf-guard';

export const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface HttpCheckInput {
  url: string;
  method: MonitorMethod;
  timeoutMs: number;
  expectedStatusCodes: readonly number[];
}

export interface HttpCheckOutcome {
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorType: CheckErrorType | null;
  errorMetadata?: CheckErrorMetadata;
}

export interface HttpChecker {
  check(input: HttpCheckInput): Promise<HttpCheckOutcome>;
}

interface SafeHttpCheckerOptions {
  globalTimeoutMs: number;
  maxResponseBodyBytes: number;
  allowPrivateNetworkTargets: boolean;
  transport: HttpTransport;
  resolver?: DnsResolver;
  highResolutionClock?: () => number;
}

function parseInitialUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new TargetValidationError('INVALID_URL');
  }
}

function redirectLocation(response: HttpTransportResponse): string {
  if (typeof response.location !== 'string' || response.location.length === 0) {
    throw new RedirectError('INVALID_LOCATION');
  }

  return response.location;
}

function parseRedirectUrl(location: string, currentUrl: URL): URL {
  let redirectUrl: URL;

  try {
    redirectUrl = new URL(location, currentUrl);
  } catch {
    throw new RedirectError('INVALID_LOCATION');
  }

  if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
    throw new RedirectError('UNSUPPORTED_PROTOCOL');
  }

  if (redirectUrl.username || redirectUrl.password) {
    throw new RedirectError('EMBEDDED_CREDENTIALS');
  }

  return redirectUrl;
}

async function discardBoundedBody(body: Readable, maximumBytes: number): Promise<void> {
  let consumedBytes = 0;

  for await (const chunk of body) {
    const chunkLength = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(String(chunk));
    consumedBytes += chunkLength;

    if (consumedBytes >= maximumBytes) {
      safelyDestroyBody(body);
      return;
    }
  }
}

function safelyDestroyBody(body: Readable): void {
  if (body.destroyed) {
    return;
  }

  body.once('error', () => undefined);
  body.destroy();
}

function successfulOutcome(statusCode: number, latencyMs: number): HttpCheckOutcome {
  return {
    success: true,
    statusCode,
    latencyMs,
    errorType: null,
  };
}

function unexpectedStatusOutcome(
  statusCode: number,
  latencyMs: number,
): HttpCheckOutcome {
  return {
    success: false,
    statusCode,
    latencyMs,
    errorType: 'unexpected_status',
  };
}

export class SafeHttpChecker implements HttpChecker {
  private readonly resolver: DnsResolver;
  private readonly highResolutionClock: () => number;

  public constructor(private readonly options: SafeHttpCheckerOptions) {
    this.resolver = options.resolver ?? new NodeDnsResolver();
    this.highResolutionClock = options.highResolutionClock ?? (() => performance.now());
  }

  public async check(input: HttpCheckInput): Promise<HttpCheckOutcome> {
    const effectiveTimeoutMs = Math.min(input.timeoutMs, this.options.globalTimeoutMs);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), effectiveTimeoutMs);
    timeout.unref();
    const startedAt = this.highResolutionClock();
    let statusCode: number | null = null;
    let latencyMs: number | null = null;
    let activeResponse: HttpTransportResponse | undefined;

    try {
      let currentUrl = parseInitialUrl(input.url);
      const visitedUrls = new Set([currentUrl.href]);
      for (
        let requestAttempt = 0;
        requestAttempt <= MAX_REDIRECTS;
        requestAttempt += 1
      ) {
        const resolvedAddress = await resolveSafeTarget(
          currentUrl,
          this.options.allowPrivateNetworkTargets,
          this.resolver,
          abortController.signal,
        );
        const elapsedMs = this.highResolutionClock() - startedAt;
        const remainingTimeoutMs = Math.max(1, Math.ceil(effectiveTimeoutMs - elapsedMs));
        activeResponse = await this.options.transport.request({
          url: currentUrl,
          method: input.method,
          timeoutMs: remainingTimeoutMs,
          resolvedAddress,
          signal: abortController.signal,
        });
        statusCode = activeResponse.statusCode;
        latencyMs = Math.max(0, Math.round(this.highResolutionClock() - startedAt));

        if (input.expectedStatusCodes.includes(statusCode)) {
          await discardBoundedBody(activeResponse.body, this.options.maxResponseBodyBytes);
          return successfulOutcome(statusCode, latencyMs);
        }

        if (!REDIRECT_STATUSES.has(statusCode)) {
          await discardBoundedBody(activeResponse.body, this.options.maxResponseBodyBytes);
          return unexpectedStatusOutcome(statusCode, latencyMs);
        }

        if (requestAttempt === MAX_REDIRECTS) {
          throw new RedirectError('REDIRECT_LIMIT');
        }

        const nextUrl = parseRedirectUrl(redirectLocation(activeResponse), currentUrl);

        if (visitedUrls.has(nextUrl.href)) {
          throw new RedirectError('REDIRECT_LOOP');
        }

        safelyDestroyBody(activeResponse.body);
        await activeResponse.dispose();
        activeResponse = undefined;
        visitedUrls.add(nextUrl.href);
        currentUrl = nextUrl;
      }

      throw new RedirectError('REDIRECT_LIMIT');
    } catch (error: unknown) {
      const classified = classifyCheckError(error, abortController.signal.aborted);
      const outcome: HttpCheckOutcome = {
        success: false,
        statusCode,
        latencyMs,
        errorType: classified.errorType,
        errorMetadata: classified.errorMetadata,
      };
      return outcome;
    } finally {
      clearTimeout(timeout);

      if (activeResponse) {
        safelyDestroyBody(activeResponse.body);
        await activeResponse.dispose();
      }
    }
  }
}
