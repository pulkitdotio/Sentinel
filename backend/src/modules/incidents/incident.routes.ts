import { Router } from 'express';

import { createAuthenticateMiddleware } from '../../api/middleware/authenticate';
import { authenticatedUserId, requestValidationError } from '../../api/request';
import type { JwtConfiguration } from '../auth/jwt';
import {
  incidentPaginationSchema,
  incidentParamsSchema,
  monitorIncidentParamsSchema,
} from './incident.schemas';
import type { IncidentService } from './incident.service';

export function createMonitorIncidentRouter(
  incidentService: IncidentService,
  jwtConfiguration: JwtConfiguration,
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtConfiguration);

  router.get('/:monitorId/incidents', authenticate, async (request, response, next) => {
    const parsedParams = monitorIncidentParamsSchema.safeParse(request.params);
    const parsedQuery = incidentPaginationSchema.safeParse(request.query);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    if (!parsedQuery.success) {
      next(requestValidationError(parsedQuery.error));
      return;
    }

    try {
      const result = await incidentService.listForMonitor(
        authenticatedUserId(request),
        parsedParams.data.monitorId,
        parsedQuery.data,
      );
      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}

export function createIncidentRouter(
  incidentService: IncidentService,
  jwtConfiguration: JwtConfiguration,
): Router {
  const router = Router();
  router.use(createAuthenticateMiddleware(jwtConfiguration));

  router.get('/:incidentId', async (request, response, next) => {
    const parsedParams = incidentParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    try {
      const incident = await incidentService.get(
        authenticatedUserId(request),
        parsedParams.data.incidentId,
      );
      response.status(200).json({ incident });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
