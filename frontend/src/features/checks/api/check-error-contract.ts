import { z } from 'zod';

export const CHECK_ERROR_TYPES = [
  'timeout',
  'dns',
  'connection',
  'tls',
  'unexpected_status',
  'blocked_target',
  'redirect_error',
  'unknown',
] as const;

export const checkErrorTypeSchema = z.enum(CHECK_ERROR_TYPES);
export type CheckErrorType = (typeof CHECK_ERROR_TYPES)[number];
