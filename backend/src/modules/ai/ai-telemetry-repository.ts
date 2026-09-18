import { Types, type FilterQuery, type Model } from 'mongoose';

import {
  CheckResultModel,
  type CheckErrorType,
  type CheckResult,
  type CheckResultDocument,
} from '../../database/models/check-result';
import type { OwnedCheckRange } from '../checks/check-result-repository';

export interface AiCount<T> {
  value: T;
  count: number;
}

export interface AiTelemetrySummary {
  errorTypeCounts: Array<AiCount<CheckErrorType>>;
  statusCodeCounts: Array<AiCount<number>>;
  successfulChecksAboveLatencyThreshold: number;
}

export interface RepresentativeCheck {
  region: string;
  scheduledAt: Date;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorType: CheckErrorType | null;
}

export interface RepresentativeCheckRequest extends OwnedCheckRange {
  success: boolean;
  limit: number;
}

export interface AiTelemetryRepository {
  summarizeOwnedRange(
    input: OwnedCheckRange,
    latencyThresholdMs: number,
  ): Promise<AiTelemetrySummary>;
  listRepresentativeChecks(input: RepresentativeCheckRequest): Promise<RepresentativeCheck[]>;
}

function ownedFilter(input: OwnedCheckRange): FilterQuery<CheckResult> {
  return {
    userId: input.userId,
    monitorId: input.monitorId,
    scheduledAt: { $gte: input.from, $lte: input.to },
  };
}

function toRepresentativeCheck(document: CheckResultDocument): RepresentativeCheck {
  return {
    region: document.region,
    scheduledAt: document.scheduledAt,
    success: document.success,
    statusCode: document.statusCode,
    latencyMs: document.latencyMs,
    errorType: document.errorType,
  };
}

export class MongooseAiTelemetryRepository implements AiTelemetryRepository {
  public constructor(private readonly model: Model<CheckResult> = CheckResultModel) {}

  public async summarizeOwnedRange(
    input: OwnedCheckRange,
    latencyThresholdMs: number,
  ): Promise<AiTelemetrySummary> {
    interface FacetCount<T> {
      _id: T;
      count: number;
    }

    interface SummaryResult {
      errorTypes: Array<FacetCount<CheckErrorType>>;
      statusCodes: Array<FacetCount<number>>;
      slowSuccesses: Array<{ count: number }>;
    }

    const [summary] = await this.model
      .aggregate<SummaryResult>([
        {
          $match: {
            userId: new Types.ObjectId(input.userId),
            monitorId: new Types.ObjectId(input.monitorId),
            scheduledAt: { $gte: input.from, $lte: input.to },
          },
        },
        {
          $facet: {
            errorTypes: [
              { $match: { errorType: { $ne: null } } },
              { $group: { _id: '$errorType', count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 10 },
            ],
            statusCodes: [
              { $match: { statusCode: { $ne: null } } },
              { $group: { _id: '$statusCode', count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
              { $limit: 20 },
            ],
            slowSuccesses: [
              { $match: { success: true, latencyMs: { $gt: latencyThresholdMs } } },
              { $count: 'count' },
            ],
          },
        },
      ])
      .exec();

    return {
      errorTypeCounts: (summary?.errorTypes ?? []).map(({ _id, count }) => ({
        value: _id,
        count,
      })),
      statusCodeCounts: (summary?.statusCodes ?? []).map(({ _id, count }) => ({
        value: _id,
        count,
      })),
      successfulChecksAboveLatencyThreshold: summary?.slowSuccesses[0]?.count ?? 0,
    };
  }

  public async listRepresentativeChecks(
    input: RepresentativeCheckRequest,
  ): Promise<RepresentativeCheck[]> {
    const documents = await this.model
      .find({ ...ownedFilter(input), success: input.success })
      .sort({ scheduledAt: -1, _id: -1 })
      .limit(input.limit)
      .select({
        region: 1,
        scheduledAt: 1,
        success: 1,
        statusCode: 1,
        latencyMs: 1,
        errorType: 1,
      })
      .exec();

    return documents.map(toRepresentativeCheck);
  }
}
