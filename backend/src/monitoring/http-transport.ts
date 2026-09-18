import type { Readable } from 'node:stream';

import { buildConnector, Client } from 'undici';

import type { MonitorMethod } from '../database/models/monitor';
import type { ResolvedAddress } from './ssrf-guard';

export interface HttpTransportRequest {
  url: URL;
  method: MonitorMethod;
  timeoutMs: number;
  resolvedAddress: ResolvedAddress;
  signal: AbortSignal;
}

export interface HttpTransportResponse {
  statusCode: number;
  location: string | string[] | undefined;
  body: Readable;
  dispose(): Promise<void>;
}

export interface HttpTransport {
  request(input: HttpTransportRequest): Promise<HttpTransportResponse>;
}

function hostnameWithoutBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

export class UndiciHttpTransport implements HttpTransport {
  public async request(input: HttpTransportRequest): Promise<HttpTransportResponse> {
    const connect = buildConnector({ timeout: input.timeoutMs });
    const originalHostname = hostnameWithoutBrackets(input.url.hostname);
    const client = new Client(input.url.origin, {
      headersTimeout: input.timeoutMs,
      bodyTimeout: input.timeoutMs,
      connect(options, callback) {
        connect(
          {
            ...options,
            hostname: input.resolvedAddress.address,
            ...(input.url.protocol === 'https:' ? { servername: originalHostname } : {}),
          },
          callback,
        );
      },
    });

    try {
      const response = await client.request({
        path: `${input.url.pathname}${input.url.search}`,
        method: input.method,
        signal: input.signal,
        maxRedirections: 0,
        headersTimeout: input.timeoutMs,
        bodyTimeout: input.timeoutMs,
      });

      return {
        statusCode: response.statusCode,
        location: response.headers.location,
        body: response.body,
        async dispose() {
          await client.destroy();
        },
      };
    } catch (error: unknown) {
      await client.destroy();
      throw error;
    }
  }
}
