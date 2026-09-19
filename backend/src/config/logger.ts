import pino, { type DestinationStream, type LoggerOptions } from 'pino';

import type { Environment } from './env';

export function createLogger(
  environment: Environment,
  destination?: DestinationStream,
): pino.Logger {
  const options: LoggerOptions = {
    level: environment.LOG_LEVEL,
    base: {
      service: 'sentinel-backend',
      environment: environment.NODE_ENV,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.passwordHash',
        'password',
        'passwordHash',
        'token',
        'apiKey',
        'authorization',
        'cookie',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.apiKey',
        '*.authorization',
        '*.cookie',
      ],
      censor: '[REDACTED]',
    },
  };

  return pino(options, destination);
}
