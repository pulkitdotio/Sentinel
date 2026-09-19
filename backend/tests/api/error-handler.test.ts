import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createErrorHandler } from '../../src/api/middleware/error-handler';

describe('centralized error handling', () => {
  it('does not expose internal error details or stack traces in production', async () => {
    const app = express();
    app.get('/failure', () => {
      throw new Error('sensitive internal detail');
    });
    app.use(createErrorHandler(pino({ enabled: false }), true));

    const response = await request(app).get('/failure');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive internal detail');
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });
});
