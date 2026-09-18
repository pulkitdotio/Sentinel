import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runSchedulerLoop, type SchedulerTickRunner } from '../../src/scheduler/loop';

afterEach(() => {
  vi.useRealTimers();
});

describe('runSchedulerLoop', () => {
  it('waits for a slow tick and the poll delay before starting another tick', async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();
    let finishFirstTick: (() => void) | undefined;
    const firstTick = new Promise<void>((resolve) => {
      finishFirstTick = resolve;
    });
    const runTick = vi
      .fn<(now: Date) => Promise<void>>()
      .mockImplementationOnce(() => firstTick)
      .mockImplementationOnce(() => {
        abortController.abort();
        return Promise.resolve();
      });
    const runner: SchedulerTickRunner = { runTick };
    const loop = runSchedulerLoop(
      runner,
      5_000,
      abortController.signal,
      pino({ enabled: false }),
      () => new Date('2026-01-01T00:00:00.000Z'),
    );

    await vi.advanceTimersByTimeAsync(20_000);
    expect(runTick).toHaveBeenCalledTimes(1);

    finishFirstTick?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(runTick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await loop;
    expect(runTick).toHaveBeenCalledTimes(2);
  });

  it('continues after a tick-level failure', async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();
    const runTick = vi
      .fn<(now: Date) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockImplementationOnce(() => {
        abortController.abort();
        return Promise.resolve();
      });
    const loop = runSchedulerLoop(
      { runTick },
      5_000,
      abortController.signal,
      pino({ enabled: false }),
    );

    await vi.advanceTimersByTimeAsync(5_000);
    await loop;

    expect(runTick).toHaveBeenCalledTimes(2);
  });
});
