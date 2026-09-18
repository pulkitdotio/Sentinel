import { Router, type Request } from 'express';
import type { ZodError } from 'zod';

import { createAuthenticateMiddleware } from '../../api/middleware/authenticate';
import { AppError } from '../../shared/errors/app-error';
import type { JwtConfiguration } from '../auth/jwt';
import { createMonitorSchemas, monitorIdParamsSchema } from './monitor.schemas';
import type { MonitorService } from './monitor.service';

function requestValidationError(error: ZodError): AppError {
  const details = error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join('.'),
    message: issue.message,
  }));

  return new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
}

function authenticatedUserId(request: Request): string {
  const userId = request.auth?.userId;

  if (!userId) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
  }

  return userId;
}

export function createMonitorRouter(
  monitorService: MonitorService,
  jwtConfiguration: JwtConfiguration,
  enabledRegions: readonly string[],
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtConfiguration);
  const { createBodySchema, updateBodySchema } = createMonitorSchemas(enabledRegions);

  router.use(authenticate);

  router.post('/', async (request, response, next) => {
    const parsedBody = createBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      next(requestValidationError(parsedBody.error));
      return;
    }

    try {
      const monitor = await monitorService.create(authenticatedUserId(request), parsedBody.data);
      response.status(201).json({ monitor });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get('/', async (request, response, next) => {
    try {
      const monitors = await monitorService.list(authenticatedUserId(request));
      response.status(200).json({ monitors });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get('/:monitorId', async (request, response, next) => {
    const parsedParams = monitorIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    try {
      const monitor = await monitorService.get(
        authenticatedUserId(request),
        parsedParams.data.monitorId,
      );
      response.status(200).json({ monitor });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch('/:monitorId', async (request, response, next) => {
    const parsedParams = monitorIdParamsSchema.safeParse(request.params);
    const parsedBody = updateBodySchema.safeParse(request.body);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    if (!parsedBody.success) {
      next(requestValidationError(parsedBody.error));
      return;
    }

    try {
      const monitor = await monitorService.update(
        authenticatedUserId(request),
        parsedParams.data.monitorId,
        parsedBody.data,
      );
      response.status(200).json({ monitor });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete('/:monitorId', async (request, response, next) => {
    const parsedParams = monitorIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    try {
      await monitorService.delete(authenticatedUserId(request), parsedParams.data.monitorId);
      response.status(204).send();
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post('/:monitorId/pause', async (request, response, next) => {
    const parsedParams = monitorIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    try {
      const monitor = await monitorService.pause(
        authenticatedUserId(request),
        parsedParams.data.monitorId,
      );
      response.status(200).json({ monitor });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post('/:monitorId/resume', async (request, response, next) => {
    const parsedParams = monitorIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    try {
      const monitor = await monitorService.resume(
        authenticatedUserId(request),
        parsedParams.data.monitorId,
      );
      response.status(200).json({ monitor });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
