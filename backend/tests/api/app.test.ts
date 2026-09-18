import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/api/app';

const app = createApp({
  logger: pino({ enabled: false }),
  isProduction: false,
});

describe('Sentinel API foundation', () => {
  it('returns the application health status', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns the standard error envelope for an unknown route', async () => {
    const response = await request(app).get('/api/v1/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route GET /api/v1/unknown was not found',
      },
    });
  });
});
