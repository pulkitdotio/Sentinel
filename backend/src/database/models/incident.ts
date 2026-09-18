import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

import { CHECK_ERROR_TYPES, type CheckErrorType } from './check-result';

export const INCIDENT_STATUSES = ['open', 'resolved'] as const;
export const INCIDENT_EVENT_TYPES = ['opened', 'resolved'] as const;
export const MAX_INCIDENT_EVIDENCE_REGIONS = 20;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type IncidentEventType = (typeof INCIDENT_EVENT_TYPES)[number];

export interface IncidentRegionEvidence {
  region: string;
  consecutiveFailures: number;
  latestErrorType: CheckErrorType | null;
}

export interface IncidentOpeningStatusEvidence {
  requiredConsensus: number;
  failureThreshold: number;
  regions: IncidentRegionEvidence[];
}

export interface IncidentEvent {
  type: IncidentEventType;
  at: Date;
  message: string;
}

export interface Incident {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  monitorId: Types.ObjectId;
  status: IncidentStatus;
  openedAt: Date;
  resolvedAt: Date | null;
  triggerReason: string;
  openingStatusEvidence: IncidentOpeningStatusEvidence;
  events: IncidentEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export type IncidentDocument = HydratedDocument<Incident>;

const incidentRegionEvidenceSchema = new Schema<IncidentRegionEvidence>(
  {
    region: { type: String, required: true, trim: true },
    consecutiveFailures: { type: Number, required: true, min: 1, max: 10 },
    latestErrorType: { type: String, enum: CHECK_ERROR_TYPES, default: null },
  },
  { _id: false },
);

const incidentOpeningStatusEvidenceSchema = new Schema<IncidentOpeningStatusEvidence>(
  {
    requiredConsensus: { type: Number, required: true, min: 1 },
    failureThreshold: { type: Number, required: true, min: 1, max: 10 },
    regions: {
      type: [incidentRegionEvidenceSchema],
      required: true,
      validate: {
        validator: (regions: IncidentRegionEvidence[]) =>
          regions.length > 0 && regions.length <= MAX_INCIDENT_EVIDENCE_REGIONS,
        message: `must contain between 1 and ${String(MAX_INCIDENT_EVIDENCE_REGIONS)} qualifying regions`,
      },
    },
  },
  { _id: false },
);

const incidentEventSchema = new Schema<IncidentEvent>(
  {
    type: { type: String, enum: INCIDENT_EVENT_TYPES, required: true },
    at: { type: Date, required: true },
    message: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: false },
);

const incidentSchema = new Schema<Incident>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true },
    status: { type: String, enum: INCIDENT_STATUSES, required: true },
    openedAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    triggerReason: { type: String, required: true, trim: true, maxlength: 100 },
    openingStatusEvidence: {
      type: incidentOpeningStatusEvidenceSchema,
      required: true,
    },
    events: {
      type: [incidentEventSchema],
      required: true,
      validate: {
        validator: (events: IncidentEvent[]) => events.length >= 1 && events.length <= 2,
        message: 'must contain one or two meaningful lifecycle events',
      },
    },
  },
  { timestamps: true },
);

incidentSchema.index({ userId: 1, monitorId: 1, openedAt: -1 });
incidentSchema.index(
  { monitorId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);

export const IncidentModel = model<Incident>('Incident', incidentSchema);
