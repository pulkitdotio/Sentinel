import { Types, type FilterQuery, type Model } from 'mongoose';

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

export interface IncidentCheckResultRepository {
  findById(checkResultId: string): Promise<CheckResultRecord | null>;
  listRecentByRegion(
    monitorId: string,
    region: string,
    limit: number,
  ): Promise<CheckResultRecord[]>;
}

export interface CheckHistoryRecord {
  id: string;
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
}

export interface OwnedCheckRange {
  userId: string;
  monitorId: string;
  from: Date;
  to: Date;
}

export interface CheckHistoryRequest extends OwnedCheckRange {
  region?: string;
  skip: number;
  limit: number;
}

export interface CheckHistoryPage {
  checks: CheckHistoryRecord[];
  total: number;
}

export interface RegionalCheckAggregate {
  region: string;
  totalChecks: number;
  successfulChecks: number;
  latencySampleCount: number;
  latencyTotalMs: number;
}

export interface LatestRegionalCheck {
  region: string;
  scheduledAt: Date;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorType: CheckErrorType | null;
}

export interface MetricsCheckResultRepository {
  listOwnedHistory(input: CheckHistoryRequest): Promise<CheckHistoryPage>;
  summarizeOwnedRange(input: OwnedCheckRange): Promise<RegionalCheckAggregate[]>;
  listOwnedLatencyValues(input: OwnedCheckRange): Promise<number[]>;
  listLatestOwnedByRegions(
    input: OwnedCheckRange,
    regions: readonly string[],
  ): Promise<LatestRegionalCheck[]>;
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

function toCheckHistoryRecord(document: CheckResultDocument): CheckHistoryRecord {
  const record: CheckHistoryRecord = {
    id: document._id.toHexString(),
    monitorId: document.monitorId.toHexString(),
    region: document.region,
    scheduledAt: document.scheduledAt,
    startedAt: document.startedAt,
    completedAt: document.completedAt,
    success: document.success,
    statusCode: document.statusCode,
    latencyMs: document.latencyMs,
    errorType: document.errorType,
  };

  if (document.errorMetadata?.code) {
    record.errorMetadata = { code: document.errorMetadata.code };
  }

  return record;
}

function toLatestRegionalCheck(document: CheckResultDocument): LatestRegionalCheck {
  return {
    region: document.region,
    scheduledAt: document.scheduledAt,
    success: document.success,
    statusCode: document.statusCode,
    latencyMs: document.latencyMs,
    errorType: document.errorType,
  };
}

function ownedRangeFilter(input: OwnedCheckRange): FilterQuery<CheckResult> {
  return {
    userId: input.userId,
    monitorId: input.monitorId,
    scheduledAt: { $gte: input.from, $lte: input.to },
  };
}

function ownedRangeAggregationMatch(input: OwnedCheckRange): Record<string, unknown> {
  return {
    userId: new Types.ObjectId(input.userId),
    monitorId: new Types.ObjectId(input.monitorId),
    scheduledAt: { $gte: input.from, $lte: input.to },
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11_000
  );
}

export class MongooseCheckResultRepository
  implements
    CheckResultRepository,
    IncidentCheckResultRepository,
    MetricsCheckResultRepository
{
  public constructor(
    private readonly checkResultModel: Model<CheckResult> = CheckResultModel,
  ) {}

  public async findByIdentity(
    identity: CheckResultIdentity,
  ): Promise<CheckResultRecord | null> {
    const result = await this.checkResultModel.findOne(identity).exec();
    return result ? toCheckResultRecord(result) : null;
  }

  public async findById(checkResultId: string): Promise<CheckResultRecord | null> {
    const result = await this.checkResultModel.findById(checkResultId).exec();
    return result ? toCheckResultRecord(result) : null;
  }

  public async listRecentByRegion(
    monitorId: string,
    region: string,
    limit: number,
  ): Promise<CheckResultRecord[]> {
    const results = await this.checkResultModel
      .find({ monitorId, region })
      .sort({ scheduledAt: -1 })
      .limit(limit)
      .exec();

    return results.map(toCheckResultRecord);
  }

  public async listOwnedHistory(input: CheckHistoryRequest): Promise<CheckHistoryPage> {
    const filter: FilterQuery<CheckResult> = ownedRangeFilter(input);

    if (input.region !== undefined) {
      filter.region = input.region;
    }

    const [documents, total] = await Promise.all([
      this.checkResultModel
        .find(filter)
        .sort({ scheduledAt: -1, _id: -1 })
        .skip(input.skip)
        .limit(input.limit)
        .select({
          monitorId: 1,
          region: 1,
          scheduledAt: 1,
          startedAt: 1,
          completedAt: 1,
          success: 1,
          statusCode: 1,
          latencyMs: 1,
          errorType: 1,
          errorMetadata: 1,
        })
        .exec(),
      this.checkResultModel.countDocuments(filter).exec(),
    ]);

    return { checks: documents.map(toCheckHistoryRecord), total };
  }

  public async summarizeOwnedRange(
    input: OwnedCheckRange,
  ): Promise<RegionalCheckAggregate[]> {
    interface AggregateResult {
      _id: string;
      totalChecks: number;
      successfulChecks: number;
      latencySampleCount: number;
      latencyTotalMs: number;
    }

    const results = await this.checkResultModel
      .aggregate<AggregateResult>([
        { $match: ownedRangeAggregationMatch(input) },
        {
          $group: {
            _id: '$region',
            totalChecks: { $sum: 1 },
            successfulChecks: {
              $sum: { $cond: [{ $eq: ['$success', true] }, 1, 0] },
            },
            latencySampleCount: {
              $sum: { $cond: [{ $ne: ['$latencyMs', null] }, 1, 0] },
            },
            latencyTotalMs: {
              $sum: { $cond: [{ $ne: ['$latencyMs', null] }, '$latencyMs', 0] },
            },
          },
        },
      ])
      .exec();

    return results.map((result) => ({
      region: result._id,
      totalChecks: result.totalChecks,
      successfulChecks: result.successfulChecks,
      latencySampleCount: result.latencySampleCount,
      latencyTotalMs: result.latencyTotalMs,
    }));
  }

  public async listOwnedLatencyValues(input: OwnedCheckRange): Promise<number[]> {
    const documents = await this.checkResultModel
      .find({ ...ownedRangeFilter(input), latencyMs: { $ne: null } })
      .select({ _id: 0, latencyMs: 1 })
      .lean()
      .exec();

    return documents.flatMap((document) =>
      typeof document.latencyMs === 'number' ? [document.latencyMs] : [],
    );
  }

  public async listLatestOwnedByRegions(
    input: OwnedCheckRange,
    regions: readonly string[],
  ): Promise<LatestRegionalCheck[]> {
    const documents = await Promise.all(
      regions.map((region) =>
        this.checkResultModel
          .findOne({ ...ownedRangeFilter(input), region })
          .sort({ scheduledAt: -1, _id: -1 })
          .select({
            region: 1,
            scheduledAt: 1,
            success: 1,
            statusCode: 1,
            latencyMs: 1,
            errorType: 1,
          })
          .exec(),
      ),
    );

    return documents.flatMap((document) =>
      document === null ? [] : [toLatestRegionalCheck(document)],
    );
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
