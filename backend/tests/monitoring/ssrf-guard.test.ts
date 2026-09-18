import { describe, expect, it, vi } from 'vitest';

import {
  isPublicAddress,
  resolveSafeTarget,
  TargetValidationError,
  type DnsResolver,
  type ResolvedAddress,
} from '../../src/monitoring/ssrf-guard';

function resolverFor(addresses: readonly ResolvedAddress[]): DnsResolver {
  return { resolve: vi.fn().mockResolvedValue(addresses) };
}

function activeSignal(): AbortSignal {
  return new AbortController().signal;
}

describe('SSRF guard', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.1.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:192.168.1.1',
  ])('classifies %s as non-public', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'classifies %s as public',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://169.254.1.1/',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
  ])('blocks direct non-public target %s', async (target) => {
    await expect(
      resolveSafeTarget(new URL(target), false, resolverFor([]), activeSignal()),
    ).rejects.toMatchObject({ code: 'NON_PUBLIC_ADDRESS' });
  });

  it('accepts and normalizes a direct public IP', async () => {
    await expect(
      resolveSafeTarget(
        new URL('https://[::ffff:8.8.8.8]/'),
        false,
        resolverFor([]),
        activeSignal(),
      ),
    ).resolves.toEqual({ address: '8.8.8.8', family: 4 });
  });

  it('blocks a hostname resolving to a private address', async () => {
    await expect(
      resolveSafeTarget(
        new URL('https://internal.example/'),
        false,
        resolverFor([{ address: '10.0.0.5', family: 4 }]),
        activeSignal(),
      ),
    ).rejects.toMatchObject({ code: 'NON_PUBLIC_ADDRESS' });
  });

  it('blocks mixed public and private DNS answers', async () => {
    await expect(
      resolveSafeTarget(
        new URL('https://mixed.example/'),
        false,
        resolverFor([
          { address: '8.8.8.8', family: 4 },
          { address: '192.168.1.10', family: 4 },
        ]),
        activeSignal(),
      ),
    ).rejects.toMatchObject({ code: 'NON_PUBLIC_ADDRESS' });
  });

  it('allows private addresses only when explicitly configured', async () => {
    await expect(
      resolveSafeTarget(
        new URL('http://local.example/'),
        true,
        resolverFor([{ address: '192.168.1.10', family: 4 }]),
        activeSignal(),
      ),
    ).resolves.toEqual({ address: '192.168.1.10', family: 4 });
  });

  it('rejects unsupported protocols and embedded credentials', async () => {
    const resolver = resolverFor([{ address: '8.8.8.8', family: 4 }]);

    await expect(
      resolveSafeTarget(new URL('ftp://example.com/'), false, resolver, activeSignal()),
    ).rejects.toBeInstanceOf(TargetValidationError);
    await expect(
      resolveSafeTarget(
        new URL('https://user:secret@example.com/'),
        false,
        resolver,
        activeSignal(),
      ),
    ).rejects.toMatchObject({ code: 'EMBEDDED_CREDENTIALS' });
  });
});
