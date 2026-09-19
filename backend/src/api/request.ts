import type { Request } from 'express';
import type { ZodError } from 'zod';

import { AppError } from '../shared/errors/app-error';

export function requestValidationError(error: ZodError): AppError {
  return new AppError(
    400,
    'VALIDATION_ERROR',
    'Request validation failed',
    error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}

export function authenticatedUserId(request: Request): string {
  const userId = request.auth?.userId;

  if (!userId) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
  }

  return userId;
}
