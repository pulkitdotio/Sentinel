import { Router } from 'express';
import type { ZodError } from 'zod';

import { createAuthenticateMiddleware } from '../../api/middleware/authenticate';
import { AppError } from '../../shared/errors/app-error';
import { loginBodySchema, registerBodySchema } from './auth.schemas';
import type { AuthService } from './auth.service';
import type { JwtConfiguration } from './jwt';

function requestValidationError(error: ZodError): AppError {
  const details = error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join('.'),
    message: issue.message,
  }));

  return new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
}

export function createAuthRouter(
  authService: AuthService,
  jwtConfiguration: JwtConfiguration,
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtConfiguration);

  router.post('/register', async (request, response, next) => {
    const parsedBody = registerBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      next(requestValidationError(parsedBody.error));
      return;
    }

    try {
      const result = await authService.register(parsedBody.data);
      response.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post('/login', async (request, response, next) => {
    const parsedBody = loginBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      next(requestValidationError(parsedBody.error));
      return;
    }

    try {
      const result = await authService.login(parsedBody.data);
      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get('/me', authenticate, async (request, response, next) => {
    const userId = request.auth?.userId;

    if (!userId) {
      next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
      return;
    }

    try {
      const user = await authService.getCurrentUser(userId);
      response.status(200).json({ user });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
