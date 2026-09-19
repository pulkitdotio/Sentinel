import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/config/logger';
import { validEnvironment } from '../helpers/environment';

describe('structured logger redaction', () => {
  it('redacts bearer tokens, cookies, passwords, and API keys', async () => {
    let output = '';
    const destination = new Writable({
      write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
      ) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger(
      {
        ...validEnvironment,
        LOG_LEVEL: 'info',
      },
      destination,
    );

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer secret-jwt',
            cookie: 'session=secret-cookie',
          },
          body: { password: 'secret-password' },
        },
        token: 'secret-token',
        apiKey: 'secret-api-key',
      },
      'redaction test',
    );
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('secret-jwt');
    expect(output).not.toContain('secret-cookie');
    expect(output).not.toContain('secret-password');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('secret-api-key');
  });
});
