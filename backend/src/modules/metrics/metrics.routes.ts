import { Router } from 'express';

import { createAuthenticateMiddleware } from '../../api/middleware/authenticate';
import { authenticatedUserId, requestValidationError } from '../../api/request';
import type { JwtConfiguration } from '../auth/jwt';
import { checkHistoryQuerySchema, metricsMonitorParamsSchema } from './metrics.schemas';
import type { MetricsService } from './metrics.service';
import { createEffectiveTimeRangeSchema } from './time-range';

export function createMonitorMetricsRouter(
  metricsService: MetricsService,
  jwtConfiguration: JwtConfiguration,
  clock: () => Date = () => new Date(),
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(jwtConfiguration);

  router.use(authenticate);

  router.get('/:monitorId/checks', async (request, response, next) => {
    const parsedParams = metricsMonitorParamsSchema.safeParse(request.params);
    const parsedQuery = checkHistoryQuerySchema.safeParse(request.query);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    if (!parsedQuery.success) {
      next(requestValidationError(parsedQuery.error));
      return;
    }

    const parsedRange = createEffectiveTimeRangeSchema(clock()).safeParse({
      from: parsedQuery.data.from,
      to: parsedQuery.data.to,
    });

    if (!parsedRange.success) {
      next(requestValidationError(parsedRange.error));
      return;
    }

    try {
      const result = await metricsService.listChecks(
        authenticatedUserId(request),
        parsedParams.data.monitorId,
        {
          page: parsedQuery.data.page,
          limit: parsedQuery.data.limit,
          ...(parsedQuery.data.region === undefined ? {} : { region: parsedQuery.data.region }),
        },
        parsedRange.data,
      );
      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get('/:monitorId/metrics', async (request, response, next) => {
    const parsedParams = metricsMonitorParamsSchema.safeParse(request.params);
    const parsedRange = createEffectiveTimeRangeSchema(clock()).safeParse(request.query);

    if (!parsedParams.success) {
      next(requestValidationError(parsedParams.error));
      return;
    }

    if (!parsedRange.success) {
      next(requestValidationError(parsedRange.error));
      return;
    }

    try {
      const result = await metricsService.getMetrics(
        authenticatedUserId(request),
        parsedParams.data.monitorId,
        parsedRange.data,
      );
      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
