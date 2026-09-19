import { Router } from 'express';

import { createAuthenticateMiddleware } from '../../api/middleware/authenticate';
import { authenticatedUserId, requestValidationError } from '../../api/request';
import { loginBodySchema, registerBodySchema } from './auth.schemas';
import type { AuthService } from './auth.service';
import type { JwtConfiguration } from './jwt';

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
    try {
      const user = await authService.getCurrentUser(authenticatedUserId(request));
      response.status(200).json({ user });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
