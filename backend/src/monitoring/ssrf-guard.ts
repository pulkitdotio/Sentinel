import { lookup } from 'node:dns/promises';

import ipaddr from 'ipaddr.js';

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface DnsResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export type TargetValidationCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'EMBEDDED_CREDENTIALS'
  | 'NON_PUBLIC_ADDRESS'
  | 'NO_RESOLVED_ADDRESSES';

export class TargetValidationError extends Error {
  public constructor(public readonly code: TargetValidationCode) {
    super('Target failed safety validation');
    this.name = 'TargetValidationError';
  }
}

export class OperationAbortedError extends Error {
  public readonly code = 'ABORT_ERR';

  public constructor() {
    super('Operation aborted');
    this.name = 'OperationAbortedError';
  }
}

export class NodeDnsResolver implements DnsResolver {
  public async resolve(hostname: string): Promise<readonly ResolvedAddress[]> {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.map(({ address, family }) => ({
      address,
      family: family === 6 ? 6 : 4,
    }));
  }
}

function hostnameWithoutBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function normalizeAddress(address: string): ResolvedAddress {
  if (!ipaddr.isValid(address)) {
    throw new TargetValidationError('INVALID_URL');
  }

  const parsed = ipaddr.process(address);
  return {
    address: parsed.toString(),
    family: parsed.kind() === 'ipv4' ? 4 : 6,
  };
}

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }

  return ipaddr.process(address).range() === 'unicast';
}

async function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw new OperationAbortedError();
  }

  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(new OperationAbortedError());
    };

    signal.addEventListener('abort', abort, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error instanceof Error ? error : new Error('DNS resolution failed'));
      },
    );
  });
}

export async function resolveSafeTarget(
  target: URL,
  allowPrivateNetworkTargets: boolean,
  resolver: DnsResolver,
  signal: AbortSignal,
): Promise<ResolvedAddress> {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new TargetValidationError('UNSUPPORTED_PROTOCOL');
  }

  if (target.username || target.password) {
    throw new TargetValidationError('EMBEDDED_CREDENTIALS');
  }

  const hostname = hostnameWithoutBrackets(target.hostname);
  let addresses: readonly ResolvedAddress[];

  if (ipaddr.isValid(hostname)) {
    addresses = [normalizeAddress(hostname)];
  } else {
    addresses = await raceWithAbort(resolver.resolve(hostname), signal);
  }

  if (addresses.length === 0) {
    throw new TargetValidationError('NO_RESOLVED_ADDRESSES');
  }

  const normalizedAddresses = addresses.map(({ address }) => normalizeAddress(address));

  if (
    !allowPrivateNetworkTargets &&
    normalizedAddresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new TargetValidationError('NON_PUBLIC_ADDRESS');
  }

  const selectedAddress = normalizedAddresses[0];

  if (!selectedAddress) {
    throw new TargetValidationError('NO_RESOLVED_ADDRESSES');
  }

  return selectedAddress;
}
