import { AppError } from '../../shared/errors/app-error';
import type { CreateMonitorInput, UpdateMonitorInput } from './monitor.schemas';
import type {
  MonitorRecord,
  MonitorRepository,
  UpdateMonitorRecord,
} from './monitor-repository';

export interface SafeMonitor {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: 'GET' | 'HEAD';
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCodes: number[];
  latencyThresholdMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  regions: string[];
  isPaused: boolean;
  status: 'pending' | 'healthy' | 'degraded' | 'down' | 'paused';
  nextCheckAt: string;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function monitorNotFoundError(): AppError {
  return new AppError(404, 'MONITOR_NOT_FOUND', 'Monitor not found');
}

function toSafeMonitor(monitor: MonitorRecord): SafeMonitor {
  return {
    id: monitor.id,
    userId: monitor.userId,
    name: monitor.name,
    url: monitor.url,
    method: monitor.method,
    intervalSeconds: monitor.intervalSeconds,
    timeoutMs: monitor.timeoutMs,
    expectedStatusCodes: [...monitor.expectedStatusCodes],
    latencyThresholdMs: monitor.latencyThresholdMs,
    failureThreshold: monitor.failureThreshold,
    recoveryThreshold: monitor.recoveryThreshold,
    regions: [...monitor.regions],
    isPaused: monitor.isPaused,
    status: monitor.status,
    nextCheckAt: monitor.nextCheckAt.toISOString(),
    lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
    createdAt: monitor.createdAt.toISOString(),
    updatedAt: monitor.updatedAt.toISOString(),
  };
}

export class MonitorService {
  public constructor(
    private readonly monitorRepository: MonitorRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async create(userId: string, input: CreateMonitorInput): Promise<SafeMonitor> {
    const now = this.clock();
    const monitor = await this.monitorRepository.create({
      ...input,
      userId,
      isPaused: false,
      status: 'pending',
      nextCheckAt: now,
      lastCheckedAt: null,
    });

    return toSafeMonitor(monitor);
  }

  public async list(userId: string): Promise<SafeMonitor[]> {
    const monitors = await this.monitorRepository.listByUser(userId);
    return monitors.map(toSafeMonitor);
  }

  public async get(userId: string, monitorId: string): Promise<SafeMonitor> {
    const monitor = await this.monitorRepository.findOwnedById(userId, monitorId);

    if (!monitor) {
      throw monitorNotFoundError();
    }

    return toSafeMonitor(monitor);
  }

  public async update(
    userId: string,
    monitorId: string,
    input: UpdateMonitorInput,
  ): Promise<SafeMonitor> {
    const existingMonitor = await this.monitorRepository.findOwnedById(userId, monitorId);

    if (!existingMonitor) {
      throw monitorNotFoundError();
    }

    const update: UpdateMonitorRecord = {};

    if (input.name !== undefined) update.name = input.name;
    if (input.url !== undefined) update.url = input.url;
    if (input.method !== undefined) update.method = input.method;
    if (input.intervalSeconds !== undefined) update.intervalSeconds = input.intervalSeconds;
    if (input.timeoutMs !== undefined) update.timeoutMs = input.timeoutMs;
    if (input.expectedStatusCodes !== undefined) {
      update.expectedStatusCodes = input.expectedStatusCodes;
    }
    if (input.latencyThresholdMs !== undefined) {
      update.latencyThresholdMs = input.latencyThresholdMs;
    }
    if (input.failureThreshold !== undefined) update.failureThreshold = input.failureThreshold;
    if (input.recoveryThreshold !== undefined) update.recoveryThreshold = input.recoveryThreshold;
    if (input.regions !== undefined) update.regions = input.regions;
    if (!existingMonitor.isPaused) update.nextCheckAt = this.clock();

    const monitor = await this.monitorRepository.updateOwnedById(userId, monitorId, update);

    if (!monitor) {
      throw monitorNotFoundError();
    }

    return toSafeMonitor(monitor);
  }

  public async delete(userId: string, monitorId: string): Promise<void> {
    const wasDeleted = await this.monitorRepository.deleteOwnedById(userId, monitorId);

    if (!wasDeleted) {
      throw monitorNotFoundError();
    }
  }

  public async pause(userId: string, monitorId: string): Promise<SafeMonitor> {
    const monitor = await this.monitorRepository.updateOwnedById(userId, monitorId, {
      isPaused: true,
      status: 'paused',
    });

    if (!monitor) {
      throw monitorNotFoundError();
    }

    return toSafeMonitor(monitor);
  }

  public async resume(userId: string, monitorId: string): Promise<SafeMonitor> {
    const monitor = await this.monitorRepository.updateOwnedById(userId, monitorId, {
      isPaused: false,
      status: 'pending',
      nextCheckAt: this.clock(),
    });

    if (!monitor) {
      throw monitorNotFoundError();
    }

    return toSafeMonitor(monitor);
  }
}
