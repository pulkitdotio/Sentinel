import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export const CHECK_ERROR_TYPES = [
  'timeout',
  'dns',
  'connection',
  'tls',
  'unexpected_status',
  'blocked_target',
  'redirect_error',
  'unknown',
] as const;

export type CheckErrorType = (typeof CHECK_ERROR_TYPES)[number];

export interface CheckErrorMetadata {
  code?: string;
}

export interface CheckResult {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  monitorId: Types.ObjectId;
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

export type CheckResultDocument = HydratedDocument<CheckResult>;

const errorMetadataSchema = new Schema<CheckErrorMetadata>(
  {
    code: { type: String, trim: true, maxlength: 64 },
  },
  { _id: false },
);

const checkResultSchema = new Schema<CheckResult>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    monitorId: {
      type: Schema.Types.ObjectId,
      ref: 'Monitor',
      required: true,
    },
    region: { type: String, required: true, trim: true },
    scheduledAt: { type: Date, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    success: { type: Boolean, required: true },
    statusCode: { type: Number, min: 100, max: 599, default: null },
    latencyMs: { type: Number, min: 0, default: null },
    errorType: { type: String, enum: CHECK_ERROR_TYPES, default: null },
    errorMetadata: { type: errorMetadataSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

checkResultSchema.index(
  { monitorId: 1, region: 1, scheduledAt: 1 },
  { unique: true },
);
checkResultSchema.index({ userId: 1, monitorId: 1, scheduledAt: -1 });
checkResultSchema.index({ monitorId: 1, region: 1, scheduledAt: -1 });

export const CheckResultModel = model<CheckResult>('CheckResult', checkResultSchema);
