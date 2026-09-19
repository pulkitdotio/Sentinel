import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/api/app';

const app = createApp({
  logger: pino({ enabled: false }),
  isProduction: false,
  clientOrigin: 'http://client.example.com',
  auth: {
    secret: 'a-test-secret-that-is-long-enough',
    expiresIn: '7d',
  },
  monitors: {
    enabledRegions: ['mumbai', 'singapore', 'frankfurt'],
  },
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

  it('allows the exact configured browser origin and varies the response by Origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://client.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://client.example.com',
    );
    expect(response.headers.vary).toContain('Origin');
  });

  it('continues normally without an Origin header', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles an allowed CORS preflight with the documented methods and headers', async () => {
    const response = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://client.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://client.example.com',
    );
    expect(response.headers['access-control-allow-methods']).toBe(
      'GET, POST, PATCH, DELETE, OPTIONS',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization, Content-Type',
    );
    expect(response.headers.vary).toContain('Origin');
  });

  it('does not grant CORS access to an unapproved browser origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://unapproved.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers.vary).toContain('Origin');
  });

  it('returns a stable 400 envelope for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
    });
  });

  it('returns a stable 413 envelope for JSON larger than 64 kb', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'user@example.com', password: 'x'.repeat(70_000) }));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
      },
    });
  });
});
