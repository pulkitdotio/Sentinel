import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';

import { AppError } from '../../shared/errors/app-error';

export function createErrorHandler(logger: Logger, isProduction: boolean): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
      return;
    }

    logger.error({ err: error }, 'Unhandled request error');

    response.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        ...(!isProduction && error instanceof Error ? { details: error.message } : {}),
      },
    });
  };
}
