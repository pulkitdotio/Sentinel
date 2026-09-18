import express, { type Express } from 'express';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';

import { createErrorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { healthRouter } from './routes/health';
import { createAuthRouter } from '../modules/auth/auth.routes';
import { AuthService } from '../modules/auth/auth.service';
import type { JwtConfiguration } from '../modules/auth/jwt';
import {
  MongooseCheckResultRepository,
  type MetricsCheckResultRepository,
} from '../modules/checks/check-result-repository';
import {
  MongooseUserRepository,
  type UserRepository,
} from '../modules/auth/user-repository';
import {
  createIncidentRouter,
  createMonitorIncidentRouter,
} from '../modules/incidents/incident.routes';
import {
  MongooseIncidentRepository,
  type IncidentRepository,
} from '../modules/incidents/incident-repository';
import { IncidentService } from '../modules/incidents/incident.service';
import { createMonitorMetricsRouter } from '../modules/metrics/metrics.routes';
import { MetricsService } from '../modules/metrics/metrics.service';
import { createMonitorRouter } from '../modules/monitors/monitor.routes';
import {
  MongooseMonitorRepository,
  type MonitorRepository,
} from '../modules/monitors/monitor-repository';
import { MonitorService } from '../modules/monitors/monitor.service';

export interface AuthDependencies extends JwtConfiguration {
  userRepository?: UserRepository;
}

export interface MonitorDependencies {
  enabledRegions: readonly string[];
  monitorRepository?: MonitorRepository;
  clock?: () => Date;
}

export interface AppDependencies {
  logger: Logger;
  isProduction: boolean;
  auth: AuthDependencies;
  monitors: MonitorDependencies;
  incidents?: {
    incidentRepository?: IncidentRepository;
  };
  metrics?: {
    checkResultRepository?: MetricsCheckResultRepository;
    clock?: () => Date;
  };
}

export function createApp({
  logger,
  isProduction,
  auth,
  monitors,
  incidents,
  metrics,
}: AppDependencies): Express {
  const app = express();
  const userRepository = auth.userRepository ?? new MongooseUserRepository();
  const monitorRepository = monitors.monitorRepository ?? new MongooseMonitorRepository();
  const incidentRepository =
    incidents?.incidentRepository ?? new MongooseIncidentRepository();
  const checkResultRepository =
    metrics?.checkResultRepository ?? new MongooseCheckResultRepository();
  const jwtConfiguration: JwtConfiguration = {
    secret: auth.secret,
    expiresIn: auth.expiresIn,
  };
  const authService = new AuthService(userRepository, jwtConfiguration);
  const monitorService = monitors.clock
    ? new MonitorService(monitorRepository, monitors.clock)
    : new MonitorService(monitorRepository);
  const incidentService = new IncidentService(incidentRepository, monitorRepository);
  const metricsService = new MetricsService(
    checkResultRepository,
    incidentRepository,
    monitorRepository,
  );

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter(authService, jwtConfiguration));
  app.use(
    '/api/v1/monitors',
    createMonitorIncidentRouter(incidentService, jwtConfiguration),
  );
  app.use(
    '/api/v1/monitors',
    createMonitorMetricsRouter(metricsService, jwtConfiguration, metrics?.clock),
  );
  app.use(
    '/api/v1/monitors',
    createMonitorRouter(monitorService, jwtConfiguration, monitors.enabledRegions),
  );
  app.use('/api/v1/incidents', createIncidentRouter(incidentService, jwtConfiguration));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger, isProduction));

  return app;
}
