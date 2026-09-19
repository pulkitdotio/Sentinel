import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';

import { AppError } from '../../shared/errors/app-error';

function parserErrorType(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string'
  ) {
    return error.type;
  }

  return undefined;
}

export function createErrorHandler(logger: Logger, isProduction: boolean): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    const errorType = parserErrorType(error);

    if (errorType === 'entity.parse.failed') {
      response.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'Request body contains invalid JSON',
        },
      });
      return;
    }

    if (errorType === 'entity.too.large') {
      response.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the allowed size',
        },
      });
      return;
    }

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
