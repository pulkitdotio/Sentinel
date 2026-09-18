import type { Model } from 'mongoose';

import {
  AiAnalysisModel,
  type AiAnalysis,
  type AiAnalysisDocument,
} from '../../database/models/ai-analysis';
import {
  aiAnalysisResultSchema,
  type AiAnalysisResult,
  type AiAnalysisStatus,
  type AiAnalysisType,
  type AiFailureCode,
  type AiInputWindow,
} from './ai-contracts';

export interface AiAnalysisRecord {
  id: string;
  userId: string;
  type: AiAnalysisType;
  monitorId: string | null;
  incidentId: string | null;
  status: AiAnalysisStatus;
  inputWindow: AiInputWindow;
  result: AiAnalysisResult | null;
  failureCode: AiFailureCode | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreateAiAnalysisRecord {
  userId: string;
  type: AiAnalysisType;
  monitorId: string | null;
  incidentId: string | null;
  inputWindow: AiInputWindow;
}

export interface AiAnalysisRepository {
  createQueued(input: CreateAiAnalysisRecord): Promise<AiAnalysisRecord>;
  findById(analysisId: string): Promise<AiAnalysisRecord | null>;
  findOwnedById(userId: string, analysisId: string): Promise<AiAnalysisRecord | null>;
  markProcessing(analysisId: string): Promise<AiAnalysisRecord | null>;
  completeIfProcessing(
    analysisId: string,
    result: AiAnalysisResult,
    completedAt: Date,
  ): Promise<AiAnalysisRecord | null>;
  failIfActive(
    analysisId: string,
    failureCode: AiFailureCode,
    completedAt: Date,
  ): Promise<AiAnalysisRecord | null>;
}

function toRecord(document: AiAnalysisDocument): AiAnalysisRecord {
  return {
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    type: document.type,
    monitorId: document.monitorId?.toHexString() ?? null,
    incidentId: document.incidentId?.toHexString() ?? null,
    status: document.status,
    inputWindow: {
      from: document.inputWindow.from,
      to: document.inputWindow.to,
    },
    result: document.result === null ? null : aiAnalysisResultSchema.parse(document.result),
    failureCode: document.failureCode,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    completedAt: document.completedAt,
  };
}

export class MongooseAiAnalysisRepository implements AiAnalysisRepository {
  public constructor(private readonly model: Model<AiAnalysis> = AiAnalysisModel) {}

  public async createQueued(input: CreateAiAnalysisRecord): Promise<AiAnalysisRecord> {
    const document = await this.model.create({
      ...input,
      status: 'queued',
      result: null,
      failureCode: null,
      completedAt: null,
    });
    return toRecord(document);
  }

  public async findById(analysisId: string): Promise<AiAnalysisRecord | null> {
    const document = await this.model.findById(analysisId).exec();
    return document ? toRecord(document) : null;
  }

  public async findOwnedById(
    userId: string,
    analysisId: string,
  ): Promise<AiAnalysisRecord | null> {
    const document = await this.model.findOne({ _id: analysisId, userId }).exec();
    return document ? toRecord(document) : null;
  }

  public async markProcessing(analysisId: string): Promise<AiAnalysisRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { _id: analysisId, status: { $in: ['queued', 'processing'] } },
        { $set: { status: 'processing' } },
        { new: true, runValidators: true },
      )
      .exec();
    return document ? toRecord(document) : null;
  }

  public async completeIfProcessing(
    analysisId: string,
    result: AiAnalysisResult,
    completedAt: Date,
  ): Promise<AiAnalysisRecord | null> {
    const validatedResult = aiAnalysisResultSchema.parse(result);
    const document = await this.model
      .findOneAndUpdate(
        { _id: analysisId, status: 'processing' },
        {
          $set: {
            status: 'completed',
            result: validatedResult,
            failureCode: null,
            completedAt,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    return document ? toRecord(document) : null;
  }

  public async failIfActive(
    analysisId: string,
    failureCode: AiFailureCode,
    completedAt: Date,
  ): Promise<AiAnalysisRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { _id: analysisId, status: { $in: ['queued', 'processing'] } },
        {
          $set: {
            status: 'failed',
            result: null,
            failureCode,
            completedAt,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    return document ? toRecord(document) : null;
  }
}
