import type { Model } from 'mongoose';

import {
  CheckResultModel,
  type CheckErrorMetadata,
  type CheckErrorType,
  type CheckResult,
  type CheckResultDocument,
} from '../../database/models/check-result';

export interface CheckResultRecord {
  id: string;
  userId: string;
  monitorId: string;
  region: string;
  scheduledAt: Date;
  startedAt: Date;
  completedAt: Date;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorType: CheckErrorType | null;
  errorMetadata?: CheckErrorMetadata;
  createdAt: Date;
}

export type CreateCheckResultRecord = Omit<CheckResultRecord, 'id' | 'createdAt'>;

export interface CheckResultIdentity {
  monitorId: string;
  region: string;
  scheduledAt: Date;
}

export interface CheckResultRepository {
  findByIdentity(identity: CheckResultIdentity): Promise<CheckResultRecord | null>;
  saveIdempotently(input: CreateCheckResultRecord): Promise<CheckResultRecord>;
}

function toCheckResultRecord(document: CheckResultDocument): CheckResultRecord {
  const record: CheckResultRecord = {
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    monitorId: document.monitorId.toHexString(),
    region: document.region,
    scheduledAt: document.scheduledAt,
    startedAt: document.startedAt,
    completedAt: document.completedAt,
    success: document.success,
    statusCode: document.statusCode,
    latencyMs: document.latencyMs,
    errorType: document.errorType,
    createdAt: document.createdAt,
  };

  if (document.errorMetadata?.code) {
    record.errorMetadata = { code: document.errorMetadata.code };
  }

  return record;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11_000
  );
}

export class MongooseCheckResultRepository implements CheckResultRepository {
  public constructor(
    private readonly checkResultModel: Model<CheckResult> = CheckResultModel,
  ) {}

  public async findByIdentity(
    identity: CheckResultIdentity,
  ): Promise<CheckResultRecord | null> {
    const result = await this.checkResultModel.findOne(identity).exec();
    return result ? toCheckResultRecord(result) : null;
  }

  public async saveIdempotently(
    input: CreateCheckResultRecord,
  ): Promise<CheckResultRecord> {
    const identity: CheckResultIdentity = {
      monitorId: input.monitorId,
      region: input.region,
      scheduledAt: input.scheduledAt,
    };

    try {
      await this.checkResultModel
        .updateOne(identity, { $setOnInsert: input }, { upsert: true, runValidators: true })
        .exec();
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    const result = await this.checkResultModel.findOne(identity).exec();

    if (!result) {
      throw new Error('CheckResult upsert completed without a persisted record');
    }

    return toCheckResultRecord(result);
  }
}
