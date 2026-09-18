import pino, { type LoggerOptions } from 'pino';

import type { Environment } from './env';

export function createLogger(environment: Environment): pino.Logger {
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
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.apiKey',
      ],
      censor: '[REDACTED]',
    },
  };

  return pino(options);
}
