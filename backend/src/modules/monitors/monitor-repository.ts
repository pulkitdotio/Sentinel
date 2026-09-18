import type { Model } from 'mongoose';

import {
  MonitorModel,
  type Monitor,
  type MonitorDocument,
  type MonitorMethod,
  type MonitorStatus,
} from '../../database/models/monitor';

export interface MonitorRecord {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: MonitorMethod;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCodes: number[];
  latencyThresholdMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  regions: string[];
  isPaused: boolean;
  status: MonitorStatus;
  nextCheckAt: Date;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateMonitorRecord = Omit<MonitorRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateMonitorRecord = Partial<
  Omit<MonitorRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastCheckedAt'>
>;

export interface MonitorRepository {
  create(input: CreateMonitorRecord): Promise<MonitorRecord>;
  listByUser(userId: string): Promise<MonitorRecord[]>;
  findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null>;
  updateOwnedById(
    userId: string,
    monitorId: string,
    update: UpdateMonitorRecord,
  ): Promise<MonitorRecord | null>;
  deleteOwnedById(userId: string, monitorId: string): Promise<boolean>;
}

function toMonitorRecord(monitor: MonitorDocument): MonitorRecord {
  return {
    id: monitor._id.toHexString(),
    userId: monitor.userId.toHexString(),
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
    nextCheckAt: monitor.nextCheckAt,
    lastCheckedAt: monitor.lastCheckedAt,
    createdAt: monitor.createdAt,
    updatedAt: monitor.updatedAt,
  };
}

export class MongooseMonitorRepository implements MonitorRepository {
  public constructor(private readonly monitorModel: Model<Monitor> = MonitorModel) {}

  public async create(input: CreateMonitorRecord): Promise<MonitorRecord> {
    const monitor = await this.monitorModel.create(input);
    return toMonitorRecord(monitor);
  }

  public async listByUser(userId: string): Promise<MonitorRecord[]> {
    const monitors = await this.monitorModel.find({ userId }).sort({ createdAt: -1 }).exec();
    return monitors.map(toMonitorRecord);
  }

  public async findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null> {
    const monitor = await this.monitorModel.findOne({ _id: monitorId, userId }).exec();
    return monitor ? toMonitorRecord(monitor) : null;
  }

  public async updateOwnedById(
    userId: string,
    monitorId: string,
    update: UpdateMonitorRecord,
  ): Promise<MonitorRecord | null> {
    const monitor = await this.monitorModel
      .findOneAndUpdate(
        { _id: monitorId, userId },
        { $set: update },
        { new: true, runValidators: true },
      )
      .exec();

    return monitor ? toMonitorRecord(monitor) : null;
  }

  public async deleteOwnedById(userId: string, monitorId: string): Promise<boolean> {
    const result = await this.monitorModel.deleteOne({ _id: monitorId, userId }).exec();
    return result.deletedCount === 1;
  }
}
