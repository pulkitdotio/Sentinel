import type { Logger } from 'pino';

import type {
  DueMonitorRecord,
  MonitorSchedulerRepository,
} from '../modules/monitors/monitor-repository';
import { createProbeJobId, type ProbeJobPayload } from '../queues/jobs/probe';
import type { ProbeJobPublisher } from '../queues/probe-job-publisher';

export const SCHEDULER_BATCH_SIZE = 100;

export class SchedulerService {
  public constructor(
    private readonly monitorRepository: MonitorSchedulerRepository,
    private readonly probeJobPublisher: ProbeJobPublisher,
    private readonly logger: Logger,
  ) {}

  public async runTick(now: Date): Promise<void> {
    const dueMonitors = await this.monitorRepository.findDue(now, SCHEDULER_BATCH_SIZE);

    for (const monitor of dueMonitors) {
      try {
        await this.scheduleMonitor(monitor, now);
      } catch (error: unknown) {
        this.logger.error(
          { err: error, monitorId: monitor.id, userId: monitor.userId },
          'Failed to schedule due monitor',
        );
      }
    }
  }

  private async scheduleMonitor(monitor: DueMonitorRecord, tickTime: Date): Promise<void> {
    if (monitor.regions.length === 0) {
      throw new Error('Due monitor has no configured regions');
    }

    const scheduledAt = monitor.nextCheckAt.toISOString();
    const enqueueAttempts = monitor.regions.map(async (region) => {
      const payload: ProbeJobPayload = {
        monitorId: monitor.id,
        userId: monitor.userId,
        region,
        scheduledAt,
      };

      try {
        return await this.probeJobPublisher.enqueue(payload);
      } catch (error: unknown) {
        this.logger.error(
          {
            err: error,
            monitorId: monitor.id,
            userId: monitor.userId,
            region,
            jobId: createProbeJobId(payload),
            scheduledAt,
          },
          'Failed to enqueue regional probe job',
        );
        throw error;
      }
    });
    const enqueueResults = await Promise.allSettled(enqueueAttempts);

    if (enqueueResults.some((result) => result.status === 'rejected')) {
      return;
    }

    const nextCheckAt = new Date(tickTime.getTime() + monitor.intervalSeconds * 1_000);
    const wasAdvanced = await this.monitorRepository.advanceNextCheckAt(
      monitor.id,
      monitor.nextCheckAt,
      nextCheckAt,
    );

    if (!wasAdvanced) {
      this.logger.debug(
        { monitorId: monitor.id, userId: monitor.userId, scheduledAt },
        'Monitor schedule was already advanced or is no longer active',
      );
    }
  }
}
