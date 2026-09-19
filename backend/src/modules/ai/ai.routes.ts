import { Router } from 'express';

import { createAuthenticateMiddleware } from '../../api/middleware/authenticate';
import { authenticatedUserId, requestValidationError } from '../../api/request';
import type { JwtConfiguration } from '../auth/jwt';
import type { AiAnalysisService } from './ai-analysis.service';
import {
  analysisParamsSchema,
  incidentAiParamsSchema,
  monitorAiParamsSchema,
  monitorAiRequestSchema,
} from './ai.schemas';

export function createMonitorAiRouter(
  service: AiAnalysisService,
  jwtConfiguration: JwtConfiguration,
): Router {
  const router = Router();
  router.post('/:monitorId/ai-insights', createAuthenticateMiddleware(jwtConfiguration), async (
    request,
    response,
    next,
  ) => {
    const params = monitorAiParamsSchema.safeParse(request.params);
    const body = monitorAiRequestSchema.safeParse(request.body ?? {});

    if (!params.success) {
      next(requestValidationError(params.error));
      return;
    }

    if (!body.success) {
      next(requestValidationError(body.error));
      return;
    }

    try {
      const analysis = await service.requestMonitorHealth(
        authenticatedUserId(request),
        params.data.monitorId,
        body.data.lookbackHours,
      );
      response.status(202).json({ analysis });
    } catch (error: unknown) {
      next(error);
    }
  });
  return router;
}

export function createIncidentAiRouter(
  service: AiAnalysisService,
  jwtConfiguration: JwtConfiguration,
): Router {
  const router = Router();
  router.post('/:incidentId/ai-summary', createAuthenticateMiddleware(jwtConfiguration), async (
    request,
    response,
    next,
  ) => {
    const params = incidentAiParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(requestValidationError(params.error));
      return;
    }

    try {
      const analysis = await service.requestIncidentSummary(
        authenticatedUserId(request),
        params.data.incidentId,
      );
      response.status(202).json({ analysis });
    } catch (error: unknown) {
      next(error);
    }
  });
  return router;
}

export function createAiAnalysisRouter(
  service: AiAnalysisService,
  jwtConfiguration: JwtConfiguration,
): Router {
  const router = Router();
  router.get('/:analysisId', createAuthenticateMiddleware(jwtConfiguration), async (
    request,
    response,
    next,
  ) => {
    const params = analysisParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(requestValidationError(params.error));
      return;
    }

    try {
      const analysis = await service.get(
        authenticatedUserId(request),
        params.data.analysisId,
      );
      response.status(200).json({ analysis });
    } catch (error: unknown) {
      next(error);
    }
  });
  return router;
}
