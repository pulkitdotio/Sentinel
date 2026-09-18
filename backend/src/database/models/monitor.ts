import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export const MONITOR_METHODS = ['GET', 'HEAD'] as const;
export const MONITOR_STATUSES = ['pending', 'healthy', 'degraded', 'down', 'paused'] as const;

export type MonitorMethod = (typeof MONITOR_METHODS)[number];
export type MonitorStatus = (typeof MONITOR_STATUSES)[number];

export interface Monitor {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
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

export type MonitorDocument = HydratedDocument<Monitor>;

function normalizeMonitorUrl(value: string): string {
  const trimmedValue = value.trim();

  try {
    return new URL(trimmedValue).toString();
  } catch {
    return trimmedValue;
  }
}

function isAllowedMonitorUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

const monitorSchema = new Schema<Monitor>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    url: {
      type: String,
      required: true,
      maxlength: 2_048,
      set: normalizeMonitorUrl,
      validate: {
        validator: isAllowedMonitorUrl,
        message: 'must be an HTTP or HTTPS URL without embedded credentials',
      },
    },
    method: {
      type: String,
      enum: MONITOR_METHODS,
      required: true,
    },
    intervalSeconds: {
      type: Number,
      required: true,
      min: 10,
      max: 86_400,
    },
    timeoutMs: {
      type: Number,
      required: true,
      min: 100,
      max: 30_000,
    },
    expectedStatusCodes: {
      type: [Number],
      required: true,
      validate: [
        {
          validator: (values: number[]) => values.length >= 1 && values.length <= 20,
          message: 'must contain between 1 and 20 status codes',
        },
        {
          validator: (values: number[]) => new Set(values).size === values.length,
          message: 'must not contain duplicate status codes',
        },
        {
          validator: (values: number[]) =>
            values.every((value) => Number.isInteger(value) && value >= 100 && value <= 599),
          message: 'must contain HTTP status codes between 100 and 599',
        },
      ],
    },
    latencyThresholdMs: {
      type: Number,
      required: true,
      min: 1,
      max: 60_000,
    },
    failureThreshold: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    recoveryThreshold: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    regions: {
      type: [String],
      required: true,
      validate: [
        {
          validator: (values: string[]) => values.length > 0,
          message: 'must contain at least one region',
        },
        {
          validator: (values: string[]) => new Set(values).size === values.length,
          message: 'must not contain duplicate regions',
        },
      ],
    },
    isPaused: {
      type: Boolean,
      required: true,
      default: false,
    },
    status: {
      type: String,
      enum: MONITOR_STATUSES,
      required: true,
      default: 'pending',
    },
    nextCheckAt: {
      type: Date,
      required: true,
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

monitorSchema.index({ userId: 1, createdAt: -1 });
monitorSchema.index({ isPaused: 1, nextCheckAt: 1 });

export const MonitorModel = model<Monitor>('Monitor', monitorSchema);
