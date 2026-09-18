import type { CheckErrorType } from '../database/models/check-result';
import {
  OperationAbortedError,
  TargetValidationError,
} from './ssrf-guard';

export class RedirectError extends Error {
  public constructor(public readonly code: string) {
    super('Redirect could not be followed safely');
    this.name = 'RedirectError';
  }
}

export interface ClassifiedCheckError {
  errorType: Exclude<CheckErrorType, 'unexpected_status'>;
  errorMetadata: { code: string };
}

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return undefined;
}

const TIMEOUT_CODES = new Set([
  'ABORT_ERR',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ETIMEDOUT',
]);
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA']);
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_SOCKET',
]);

function isTlsCode(code: string): boolean {
  return (
    code.startsWith('ERR_TLS_') ||
    code.startsWith('ERR_SSL_') ||
    code.startsWith('CERT_') ||
    code.startsWith('DEPTH_') ||
    code.startsWith('UNABLE_TO_') ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN'
  );
}

export function classifyCheckError(
  error: unknown,
  signalAborted: boolean,
): ClassifiedCheckError {
  if (error instanceof TargetValidationError) {
    return { errorType: 'blocked_target', errorMetadata: { code: error.code } };
  }

  if (error instanceof RedirectError) {
    return { errorType: 'redirect_error', errorMetadata: { code: error.code } };
  }

  const code = errorCode(error);

  if (
    signalAborted ||
    error instanceof OperationAbortedError ||
    (code !== undefined && TIMEOUT_CODES.has(code))
  ) {
    return { errorType: 'timeout', errorMetadata: { code: 'TIMEOUT' } };
  }

  if (code !== undefined && DNS_CODES.has(code)) {
    return { errorType: 'dns', errorMetadata: { code } };
  }

  if (code !== undefined && isTlsCode(code)) {
    return { errorType: 'tls', errorMetadata: { code } };
  }

  if (code !== undefined && CONNECTION_CODES.has(code)) {
    return { errorType: 'connection', errorMetadata: { code } };
  }

  return { errorType: 'unknown', errorMetadata: { code: code ?? 'UNKNOWN' } };
}
