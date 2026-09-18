import type { Logger } from 'pino';

type SchedulerClock = () => Date;

export interface SchedulerTickRunner {
  runTick(now: Date): Promise<void>;
}

async function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function runSchedulerLoop(
  scheduler: SchedulerTickRunner,
  pollIntervalMs: number,
  signal: AbortSignal,
  logger: Logger,
  clock: SchedulerClock = () => new Date(),
): Promise<void> {
  while (!signal.aborted) {
    try {
      await scheduler.runTick(clock());
    } catch (error: unknown) {
      logger.error({ err: error }, 'Scheduler tick failed');
    }

    await waitForDelay(pollIntervalMs, signal);
  }
}
