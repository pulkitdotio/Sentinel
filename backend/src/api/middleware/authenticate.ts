import type { RequestHandler } from 'express';

import { AppError } from '../../shared/errors/app-error';
import { verifyAccessToken, type JwtConfiguration } from '../../modules/auth/jwt';

function authenticationRequiredError(): AppError {
  return new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
}

function invalidTokenError(): AppError {
  return new AppError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token');
}

export function createAuthenticateMiddleware(configuration: JwtConfiguration): RequestHandler {
  return (request, _response, next) => {
    const authorization = request.header('authorization');

    if (!authorization) {
      next(authenticationRequiredError());
      return;
    }

    const match = /^Bearer ([^\s]+)$/i.exec(authorization);

    if (!match?.[1]) {
      next(invalidTokenError());
      return;
    }

    try {
      request.auth = {
        userId: verifyAccessToken(match[1], configuration),
      };
      next();
    } catch {
      next(invalidTokenError());
    }
  };
}
