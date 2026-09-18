import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SafeHttpChecker } from '../../src/monitoring/http-checker';
import { UndiciHttpTransport } from '../../src/monitoring/http-transport';
import type { DnsResolver } from '../../src/monitoring/ssrf-guard';

let server: Server;
let origin: string;
let lastMethod: string | undefined;

beforeAll(async () => {
  server = createServer((request, response) => {
    lastMethod = request.method;

    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/ok' });
      response.end();
      return;
    }

    if (request.url === '/slow') {
      setTimeout(() => {
        response.writeHead(200);
        response.end('late');
      }, 250).unref();
      return;
    }

    response.writeHead(200);
    response.end('response body that is intentionally larger than the test cap');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Local test server did not expose a TCP address');
  }

  origin = `http://probe.test:${address.port.toString()}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

function createChecker(): SafeHttpChecker {
  const resolver: DnsResolver = {
    resolve: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
  };
  return new SafeHttpChecker({
    globalTimeoutMs: 1_000,
    maxResponseBodyBytes: 8,
    allowPrivateNetworkTargets: true,
    resolver,
    transport: new UndiciHttpTransport(),
  });
}

describe('Undici HTTP transport integration', () => {
  it('connects to the validated pinned address and discards a bounded GET body', async () => {
    const outcome = await createChecker().check({
      url: `${origin}/ok`,
      method: 'GET',
      timeoutMs: 500,
      expectedStatusCodes: [200],
    });

    expect(outcome).toMatchObject({ success: true, statusCode: 200, errorType: null });
    expect(lastMethod).toBe('GET');
  });

  it('executes a supported HEAD check', async () => {
    const outcome = await createChecker().check({
      url: `${origin}/ok`,
      method: 'HEAD',
      timeoutMs: 500,
      expectedStatusCodes: [200],
    });

    expect(outcome.success).toBe(true);
    expect(lastMethod).toBe('HEAD');
  });

  it('handles a relative redirect with the pinned transport', async () => {
    await expect(
      createChecker().check({
        url: `${origin}/redirect`,
        method: 'GET',
        timeoutMs: 500,
        expectedStatusCodes: [200],
      }),
    ).resolves.toMatchObject({ success: true, statusCode: 200 });
  });

  it('enforces the overall timeout against a slow local endpoint', async () => {
    await expect(
      createChecker().check({
        url: `${origin}/slow`,
        method: 'GET',
        timeoutMs: 50,
        expectedStatusCodes: [200],
      }),
    ).resolves.toMatchObject({ success: false, errorType: 'timeout' });
  });
});
