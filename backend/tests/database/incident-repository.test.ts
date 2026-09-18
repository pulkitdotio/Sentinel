import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IncidentModel } from '../../src/database/models/incident';
import {
  MongooseIncidentRepository,
  type OpenIncidentInput,
} from '../../src/modules/incidents/incident-repository';

const input: OpenIncidentInput = {
  userId: '000000000000000000000001',
  monitorId: '000000000000000000000002',
  openedAt: new Date('2026-01-01T00:00:00.000Z'),
  triggerReason: 'regional_failure_consensus',
  openingStatusEvidence: {
    requiredConsensus: 2,
    failureThreshold: 2,
    regions: [
      {
        region: 'mumbai',
        consecutiveFailures: 2,
        latestErrorType: 'timeout',
      },
    ],
  },
};

function persistedIncident() {
  return new IncidentModel({
    _id: new Types.ObjectId('000000000000000000000003'),
    ...input,
    status: 'open',
    resolvedAt: null,
    events: [{ type: 'opened', at: input.openedAt, message: 'opened' }],
    createdAt: input.openedAt,
    updatedAt: input.openedAt,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MongooseIncidentRepository', () => {
  it('opens with a set-on-insert upsert and a single opened event', async () => {
    const updateOne = vi.spyOn(IncidentModel, 'updateOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
    } as never);
    vi.spyOn(IncidentModel, 'findOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue(persistedIncident()),
    } as never);
    const repository = new MongooseIncidentRepository();

    const result = await repository.openIdempotently(input);

    expect(updateOne).toHaveBeenCalledWith(
      { monitorId: input.monitorId, status: 'open' },
      {
        $setOnInsert: {
          ...input,
        status: 'open',
        resolvedAt: null,
          events: [
            {
              type: 'opened',
              at: input.openedAt,
              message: 'Incident opened after regional failure consensus',
            },
          ],
        },
      },
      { upsert: true, runValidators: true },
    );
    expect(result).toMatchObject({
      created: true,
      incident: { id: '000000000000000000000003', status: 'open' },
    });
  });

  it('identifies an existing open incident returned by the upsert', async () => {
    vi.spyOn(IncidentModel, 'updateOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue({ upsertedCount: 0 }),
    } as never);
    vi.spyOn(IncidentModel, 'findOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue(persistedIncident()),
    } as never);
    const repository = new MongooseIncidentRepository();

    await expect(repository.openIdempotently(input)).resolves.toMatchObject({
      created: false,
      incident: { id: '000000000000000000000003' },
    });
  });

  it('recovers duplicate-key opening races by returning the winning incident', async () => {
    vi.spyOn(IncidentModel, 'updateOne').mockReturnValue({
      exec: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11_000 })),
    } as never);
    vi.spyOn(IncidentModel, 'findOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue(persistedIncident()),
    } as never);
    const repository = new MongooseIncidentRepository();

    await expect(repository.openIdempotently(input)).resolves.toMatchObject({
      created: false,
      incident: { id: '000000000000000000000003' },
    });
  });

  it('resolves only an open incident and appends one resolved event atomically', async () => {
    const resolvedAt = new Date('2026-01-01T00:05:00.000Z');
    const resolvedIncident = persistedIncident();
    resolvedIncident.status = 'resolved';
    resolvedIncident.resolvedAt = resolvedAt;
    const findOneAndUpdate = vi.spyOn(IncidentModel, 'findOneAndUpdate').mockReturnValue({
      exec: vi.fn().mockResolvedValue(resolvedIncident),
    } as never);
    const repository = new MongooseIncidentRepository();

    await expect(
      repository.resolveIfOpen('000000000000000000000003', resolvedAt),
    ).resolves.toMatchObject({
      id: '000000000000000000000003',
      status: 'resolved',
      resolvedAt,
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '000000000000000000000003', status: 'open' },
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
    );
  });

  it('returns null when no open incident was changed', async () => {
    vi.spyOn(IncidentModel, 'findOneAndUpdate').mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    } as never);
    const repository = new MongooseIncidentRepository();

    await expect(
      repository.resolveIfOpen(
        '000000000000000000000003',
        new Date('2026-01-01T00:05:00.000Z'),
      ),
    ).resolves.toBeNull();
  });
});
