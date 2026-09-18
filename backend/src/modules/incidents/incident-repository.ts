import type { Model } from 'mongoose';

import {
  IncidentModel,
  type Incident,
  type IncidentDocument,
  type IncidentEvent,
  type IncidentOpeningStatusEvidence,
  type IncidentStatus,
} from '../../database/models/incident';

export interface IncidentRecord {
  id: string;
  userId: string;
  monitorId: string;
  status: IncidentStatus;
  openedAt: Date;
  resolvedAt: Date | null;
  triggerReason: string;
  openingStatusEvidence: IncidentOpeningStatusEvidence;
  events: IncidentEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenIncidentInput {
  userId: string;
  monitorId: string;
  openedAt: Date;
  triggerReason: string;
  openingStatusEvidence: IncidentOpeningStatusEvidence;
}

export interface IncidentPage {
  incidents: IncidentRecord[];
  total: number;
}

export interface OpenIncidentResult {
  incident: IncidentRecord;
  created: boolean;
}

export interface IncidentRepository {
  findOpenByMonitor(monitorId: string): Promise<IncidentRecord | null>;
  openIdempotently(input: OpenIncidentInput): Promise<OpenIncidentResult>;
  resolveIfOpen(incidentId: string, resolvedAt: Date): Promise<IncidentRecord | null>;
  listOwnedByMonitor(
    userId: string,
    monitorId: string,
    skip: number,
    limit: number,
  ): Promise<IncidentPage>;
  findOwnedById(userId: string, incidentId: string): Promise<IncidentRecord | null>;
}

function cloneOpeningEvidence(
  evidence: IncidentOpeningStatusEvidence,
): IncidentOpeningStatusEvidence {
  return {
    requiredConsensus: evidence.requiredConsensus,
    failureThreshold: evidence.failureThreshold,
    regions: evidence.regions.map((region) => ({ ...region })),
  };
}

function toIncidentRecord(document: IncidentDocument): IncidentRecord {
  return {
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    monitorId: document.monitorId.toHexString(),
    status: document.status,
    openedAt: document.openedAt,
    resolvedAt: document.resolvedAt,
    triggerReason: document.triggerReason,
    openingStatusEvidence: cloneOpeningEvidence(document.openingStatusEvidence),
    events: document.events.map((event) => ({
      type: event.type,
      at: event.at,
      message: event.message,
    })),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}

export class MongooseIncidentRepository implements IncidentRepository {
  public constructor(private readonly incidentModel: Model<Incident> = IncidentModel) {}

  public async findOpenByMonitor(monitorId: string): Promise<IncidentRecord | null> {
    const incident = await this.incidentModel.findOne({ monitorId, status: 'open' }).exec();
    return incident ? toIncidentRecord(incident) : null;
  }

  public async openIdempotently(input: OpenIncidentInput): Promise<OpenIncidentResult> {
    const identity = { monitorId: input.monitorId, status: 'open' as const };
    const incident = {
      ...input,
      status: 'open' as const,
      resolvedAt: null,
      events: [
        {
          type: 'opened' as const,
          at: input.openedAt,
          message: 'Incident opened after regional failure consensus',
        },
      ],
    };

    let created = false;

    try {
      const result = await this.incidentModel
        .updateOne(identity, { $setOnInsert: incident }, { upsert: true, runValidators: true })
        .exec();
      created = result.upsertedCount === 1;
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    const persistedIncident = await this.incidentModel.findOne(identity).exec();

    if (!persistedIncident) {
      throw new Error('Incident upsert completed without an open incident');
    }

    return { incident: toIncidentRecord(persistedIncident), created };
  }

  public async resolveIfOpen(
    incidentId: string,
    resolvedAt: Date,
  ): Promise<IncidentRecord | null> {
    const incident = await this.incidentModel
      .findOneAndUpdate(
        { _id: incidentId, status: 'open' },
        {
          $set: { status: 'resolved', resolvedAt },
          $push: {
            events: {
              type: 'resolved',
              at: resolvedAt,
              message: 'Incident resolved after regional recovery consensus',
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();

    return incident ? toIncidentRecord(incident) : null;
  }

  public async listOwnedByMonitor(
    userId: string,
    monitorId: string,
    skip: number,
    limit: number,
  ): Promise<IncidentPage> {
    const filter = { userId, monitorId };
    const [incidents, total] = await Promise.all([
      this.incidentModel.find(filter).sort({ openedAt: -1 }).skip(skip).limit(limit).exec(),
      this.incidentModel.countDocuments(filter).exec(),
    ]);

    return { incidents: incidents.map(toIncidentRecord), total };
  }

  public async findOwnedById(
    userId: string,
    incidentId: string,
  ): Promise<IncidentRecord | null> {
    const incident = await this.incidentModel.findOne({ _id: incidentId, userId }).exec();
    return incident ? toIncidentRecord(incident) : null;
  }
}
