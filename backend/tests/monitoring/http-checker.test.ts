import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import {
  MAX_REDIRECTS,
  SafeHttpChecker,
  type HttpCheckInput,
} from '../../src/monitoring/http-checker';
import type {
  HttpTransport,
  HttpTransportRequest,
  HttpTransportResponse,
} from '../../src/monitoring/http-transport';
import type { DnsResolver, ResolvedAddress } from '../../src/monitoring/ssrf-guard';

const PUBLIC_ADDRESS: ResolvedAddress = { address: '93.184.216.34', family: 4 };
const baseInput: HttpCheckInput = {
  url: 'https://example.com/health',
  method: 'GET',
  timeoutMs: 5_000,
  expectedStatusCodes: [200],
};

class FakeTransport implements HttpTransport {
  public readonly requests: HttpTransportRequest[] = [];

  public constructor(
    private readonly handler: (
      input: HttpTransportRequest,
      requestNumber: number,
    ) => Promise<HttpTransportResponse>,
  ) {}

  public request(input: HttpTransportRequest): Promise<HttpTransportResponse> {
    this.requests.push(input);
    return this.handler(input, this.requests.length);
  }
}

function fakeResponse(
  statusCode: number,
  options: { location?: string | string[]; body?: Readable } = {},
): HttpTransportResponse {
  const body = options.body ?? Readable.from([]);
  const dispose = vi.fn().mockResolvedValue(undefined);
  return {
    statusCode,
    location: options.location,
    body,
    dispose,
  };
}

function publicResolver(
  implementation: (hostname: string) => readonly ResolvedAddress[] = () => [PUBLIC_ADDRESS],
): DnsResolver {
  return {
    resolve: vi.fn((hostname: string) => Promise.resolve(implementation(hostname))),
  };
}

function errorWithCode(code: string): Error & { code: string } {
  return Object.assign(new Error('Safe test error'), { code });
}

function checkerWith(
  transport: HttpTransport,
  overrides: {
    resolver?: DnsResolver;
    globalTimeoutMs?: number;
    maxResponseBodyBytes?: number;
    allowPrivateNetworkTargets?: boolean;
  } = {},
): SafeHttpChecker {
  let highResolutionTime = 0;
  return new SafeHttpChecker({
    transport,
    resolver: overrides.resolver ?? publicResolver(),
    globalTimeoutMs: overrides.globalTimeoutMs ?? 10_000,
    maxResponseBodyBytes: overrides.maxResponseBodyBytes ?? 64,
    allowPrivateNetworkTargets: overrides.allowPrivateNetworkTargets ?? false,
    highResolutionClock: () => {
      highResolutionTime += 5;
      return highResolutionTime;
    },
  });
}

describe('SafeHttpChecker', () => {
  it('classifies an expected response as successful and records header latency', async () => {
    const transport = new FakeTransport(() =>
      Promise.resolve(fakeResponse(200, { body: Readable.from(['ignored']) })),
    );

    const outcome = await checkerWith(transport).check(baseInput);

    expect(outcome).toEqual({
      success: true,
      statusCode: 200,
      latencyMs: 10,
      errorType: null,
    });
  });

  it('supports HEAD without changing the configured method', async () => {
    const transport = new FakeTransport(() => Promise.resolve(fakeResponse(204)));

    const outcome = await checkerWith(transport).check({
      ...baseInput,
      method: 'HEAD',
      expectedStatusCodes: [204],
    });

    expect(outcome.success).toBe(true);
    expect(transport.requests[0]?.method).toBe('HEAD');
  });

  it('classifies an unexpected HTTP status with status and latency', async () => {
    const transport = new FakeTransport(() => Promise.resolve(fakeResponse(500)));

    await expect(checkerWith(transport).check(baseInput)).resolves.toMatchObject({
      success: false,
      statusCode: 500,
      latencyMs: 10,
      errorType: 'unexpected_status',
    });
  });

  it.each([
    ['UND_ERR_CONNECT_TIMEOUT', 'timeout'],
    ['ECONNREFUSED', 'connection'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls'],
  ])('classifies %s transport failures as %s', async (code, errorType) => {
    const transport = new FakeTransport(() => Promise.reject(errorWithCode(code)));

    await expect(checkerWith(transport).check(baseInput)).resolves.toMatchObject({
      success: false,
      statusCode: null,
      latencyMs: null,
      errorType,
    });
  });

  it('classifies DNS resolution failure separately', async () => {
    const resolver: DnsResolver = {
      resolve: vi.fn().mockRejectedValue(errorWithCode('ENOTFOUND')),
    };
    const transport = new FakeTransport(() => Promise.resolve(fakeResponse(200)));

    await expect(
      checkerWith(transport, { resolver }).check(baseInput),
    ).resolves.toMatchObject({ errorType: 'dns', statusCode: null });
    expect(transport.requests).toHaveLength(0);
  });

  it('classifies malformed initial targets as blocked without a request', async () => {
    const transport = new FakeTransport(() => Promise.resolve(fakeResponse(200)));

    await expect(
      checkerWith(transport).check({ ...baseInput, url: 'not a URL' }),
    ).resolves.toMatchObject({ errorType: 'blocked_target' });
    expect(transport.requests).toHaveLength(0);
  });

  it('treats an expected redirect status as final', async () => {
    const transport = new FakeTransport(() =>
      Promise.resolve(fakeResponse(302, { location: '/next' })),
    );

    await expect(
      checkerWith(transport).check({ ...baseInput, expectedStatusCodes: [302] }),
    ).resolves.toMatchObject({ success: true, statusCode: 302 });
    expect(transport.requests).toHaveLength(1);
  });

  it('follows a relative redirect after validating the new target', async () => {
    const transport = new FakeTransport((_input, requestNumber) =>
      Promise.resolve(
        requestNumber === 1
          ? fakeResponse(302, { location: '/ready' })
          : fakeResponse(200),
      ),
    );

    const outcome = await checkerWith(transport).check(baseInput);

    expect(outcome.success).toBe(true);
    expect(transport.requests.map((request) => request.url.href)).toEqual([
      'https://example.com/health',
      'https://example.com/ready',
    ]);
  });

  it('blocks a public-to-private redirect before the second request', async () => {
    const resolver = publicResolver((hostname) =>
      hostname === 'private.example'
        ? [{ address: '127.0.0.1', family: 4 }]
        : [PUBLIC_ADDRESS],
    );
    const transport = new FakeTransport(() =>
      Promise.resolve(fakeResponse(302, { location: 'http://private.example/secret' })),
    );

    await expect(
      checkerWith(transport, { resolver }).check(baseInput),
    ).resolves.toMatchObject({ errorType: 'blocked_target' });
    expect(transport.requests).toHaveLength(1);
  });

  it.each([
    ['redirect loop', '/health', 'REDIRECT_LOOP'],
    ['unsupported protocol', 'file:///secret', 'UNSUPPORTED_PROTOCOL'],
  ])('rejects %s as redirect_error', async (_name, location, code) => {
    const transport = new FakeTransport(() =>
      Promise.resolve(fakeResponse(302, { location })),
    );

    await expect(checkerWith(transport).check(baseInput)).resolves.toMatchObject({
      errorType: 'redirect_error',
      errorMetadata: { code },
    });
  });

  it('enforces the redirect limit', async () => {
    const transport = new FakeTransport((_input, requestNumber) =>
      Promise.resolve(
        fakeResponse(302, { location: `/redirect-${requestNumber.toString()}` }),
      ),
    );

    await expect(checkerWith(transport).check(baseInput)).resolves.toMatchObject({
      errorType: 'redirect_error',
      errorMetadata: { code: 'REDIRECT_LIMIT' },
    });
    expect(transport.requests).toHaveLength(MAX_REDIRECTS + 1);
  });

  it('uses the global timeout as the monitor timeout ceiling', async () => {
    const transport = new FakeTransport(() => Promise.resolve(fakeResponse(200)));

    await checkerWith(transport, { globalTimeoutMs: 1_000 }).check(baseInput);

    expect(transport.requests[0]?.timeoutMs).toBeLessThanOrEqual(1_000);
  });

  it('destroys a response stream after reaching the configured body cap', async () => {
    let chunksProduced = 0;
    const body = Readable.from(
      (function* bodyChunks() {
        for (let index = 0; index < 100; index += 1) {
          chunksProduced += 1;
          yield Buffer.from('x');
        }
      })(),
    );
    const transport = new FakeTransport(() =>
      Promise.resolve(fakeResponse(200, { body })),
    );

    const outcome = await checkerWith(transport, { maxResponseBodyBytes: 5 }).check(baseInput);

    expect(outcome.success).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(chunksProduced).toBeLessThan(100);
  });
});
