import express, { type Express } from 'express';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';

import { createErrorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { healthRouter } from './routes/health';

export interface AppDependencies {
  logger: Logger;
  isProduction: boolean;
}

export function createApp({ logger, isProduction }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger, isProduction));

  return app;
}
