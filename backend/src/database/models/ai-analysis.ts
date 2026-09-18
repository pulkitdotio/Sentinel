import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import {
  AI_ANALYSIS_STATUSES,
  AI_ANALYSIS_TYPES,
  AI_FAILURE_CODES,
  aiAnalysisResultSchema,
  type AiAnalysisResult,
  type AiAnalysisStatus,
  type AiAnalysisType,
  type AiFailureCode,
  type AiInputWindow,
} from '../../modules/ai/ai-contracts';

export interface AiAnalysis {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: AiAnalysisType;
  monitorId: Types.ObjectId | null;
  incidentId: Types.ObjectId | null;
  status: AiAnalysisStatus;
  inputWindow: AiInputWindow;
  result: AiAnalysisResult | null;
  failureCode: AiFailureCode | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export type AiAnalysisDocument = HydratedDocument<AiAnalysis>;

const inputWindowSchema = new Schema<AiInputWindow>(
  {
    from: { type: Date, required: true },
    to: { type: Date, required: true },
  },
  { _id: false },
);

const aiAnalysisSchema = new Schema<AiAnalysis>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: AI_ANALYSIS_TYPES, required: true },
    monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', default: null },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', default: null },
    status: { type: String, enum: AI_ANALYSIS_STATUSES, required: true, default: 'queued' },
    inputWindow: { type: inputWindowSchema, required: true },
    result: {
      type: Schema.Types.Mixed,
      default: null,
      validate: {
        validator: (value: unknown) => value === null || aiAnalysisResultSchema.safeParse(value).success,
        message: 'must be a valid bounded AI analysis result',
      },
    },
    failureCode: { type: String, enum: AI_FAILURE_CODES, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

aiAnalysisSchema.index({ userId: 1, createdAt: -1 });
aiAnalysisSchema.index({ monitorId: 1, createdAt: -1 });
aiAnalysisSchema.index({ incidentId: 1, createdAt: -1 });

export const AiAnalysisModel = model<AiAnalysis>('AiAnalysis', aiAnalysisSchema);
