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

export interface DueMonitorRecord {
  id: string;
  userId: string;
  intervalSeconds: number;
  regions: string[];
  nextCheckAt: Date;
}

export interface MonitorSchedulerRepository {
  findDue(now: Date, limit: number): Promise<DueMonitorRecord[]>;
  advanceNextCheckAt(
    monitorId: string,
    expectedNextCheckAt: Date,
    nextCheckAt: Date,
  ): Promise<boolean>;
}

export interface ProbeMonitorRepository {
  findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null>;
  updateLastCheckedAt(
    userId: string,
    monitorId: string,
    completedAt: Date,
  ): Promise<void>;
}

export interface MonitorEvaluationSnapshot {
  status: MonitorStatus;
  regions: string[];
  failureThreshold: number;
  recoveryThreshold: number;
  latencyThresholdMs: number;
}

export interface IncidentMonitorRepository {
  findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null>;
  updateEvaluationStatus(
    userId: string,
    monitorId: string,
    snapshot: MonitorEvaluationSnapshot,
    status: MonitorStatus,
  ): Promise<boolean>;
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

export class MongooseMonitorRepository
  implements
    MonitorRepository,
    MonitorSchedulerRepository,
    ProbeMonitorRepository,
    IncidentMonitorRepository
{
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

  public async findDue(now: Date, limit: number): Promise<DueMonitorRecord[]> {
    const monitors = await this.monitorModel
      .find({ isPaused: false, nextCheckAt: { $lte: now } })
      .sort({ nextCheckAt: 1 })
      .limit(limit)
      .select({ userId: 1, intervalSeconds: 1, regions: 1, nextCheckAt: 1 })
      .exec();

    return monitors.map((monitor) => ({
      id: monitor._id.toHexString(),
      userId: monitor.userId.toHexString(),
      intervalSeconds: monitor.intervalSeconds,
      regions: [...monitor.regions],
      nextCheckAt: monitor.nextCheckAt,
    }));
  }

  public async advanceNextCheckAt(
    monitorId: string,
    expectedNextCheckAt: Date,
    nextCheckAt: Date,
  ): Promise<boolean> {
    const result = await this.monitorModel
      .updateOne(
        { _id: monitorId, isPaused: false, nextCheckAt: expectedNextCheckAt },
        { $set: { nextCheckAt } },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  public async updateLastCheckedAt(
    userId: string,
    monitorId: string,
    completedAt: Date,
  ): Promise<void> {
    await this.monitorModel
      .updateOne({ _id: monitorId, userId }, { $max: { lastCheckedAt: completedAt } })
      .exec();
  }

  public async updateEvaluationStatus(
    userId: string,
    monitorId: string,
    snapshot: MonitorEvaluationSnapshot,
    status: MonitorStatus,
  ): Promise<boolean> {
    const result = await this.monitorModel
      .updateOne(
        {
          _id: monitorId,
          userId,
          isPaused: false,
          status: snapshot.status,
          regions: snapshot.regions,
          failureThreshold: snapshot.failureThreshold,
          recoveryThreshold: snapshot.recoveryThreshold,
          latencyThresholdMs: snapshot.latencyThresholdMs,
        },
        { $set: { status } },
      )
      .exec();

    return result.modifiedCount === 1;
  }
}
