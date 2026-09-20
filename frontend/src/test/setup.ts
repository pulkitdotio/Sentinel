import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { resetFakeSocketIo } from './fake-socket-io-client';

vi.mock('socket.io-client', async () => {
  const fakeClient = await import('./fake-socket-io-client');
  return { io: fakeClient.io };
});

class TestIntersectionObserver implements IntersectionObserver {
  public readonly root = null;
  public readonly rootMargin = '0px';
  public readonly scrollMargin = '0px';
  public readonly thresholds = [0];

  public disconnect(): void {}
  public observe(): void {}
  public takeRecords(): IntersectionObserverEntry[] { return []; }
  public unobserve(): void {}
}

vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);

afterEach(() => {
  cleanup();
  resetFakeSocketIo();
  vi.useRealTimers();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
