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
  MongooseUserRepository,
  type UserRepository,
} from '../modules/auth/user-repository';

export interface AuthDependencies extends JwtConfiguration {
  userRepository?: UserRepository;
}

export interface AppDependencies {
  logger: Logger;
  isProduction: boolean;
  auth: AuthDependencies;
}

export function createApp({ logger, isProduction, auth }: AppDependencies): Express {
  const app = express();
  const userRepository = auth.userRepository ?? new MongooseUserRepository();
  const jwtConfiguration: JwtConfiguration = {
    secret: auth.secret,
    expiresIn: auth.expiresIn,
  };
  const authService = new AuthService(userRepository, jwtConfiguration);

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter(authService, jwtConfiguration));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger, isProduction));

  return app;
}
