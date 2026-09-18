import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CheckResultModel } from '../../src/database/models/check-result';
import {
  MongooseCheckResultRepository,
  type CreateCheckResultRecord,
  type OwnedCheckRange,
} from '../../src/modules/checks/check-result-repository';

const input: CreateCheckResultRecord = {
  userId: '000000000000000000000001',
  monitorId: '000000000000000000000002',
  region: 'mumbai',
  scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
  startedAt: new Date('2026-01-01T00:00:00.100Z'),
  completedAt: new Date('2026-01-01T00:00:00.250Z'),
  success: true,
  statusCode: 200,
  latencyMs: 145,
  errorType: null,
};

function persistedDocument() {
  return new CheckResultModel({
    _id: new Types.ObjectId('000000000000000000000003'),
    ...input,
    createdAt: input.completedAt,
  });
}

const ownedRange: OwnedCheckRange = {
  userId: input.userId,
  monitorId: input.monitorId,
  from: new Date('2026-01-01T00:00:00.000Z'),
  to: new Date('2026-01-02T00:00:00.000Z'),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MongooseCheckResultRepository', () => {
  it('uses atomic set-on-insert upsert and returns the logical record', async () => {
    const updateExec = vi.fn().mockResolvedValue({ upsertedCount: 1 });
    const updateOne = vi
      .spyOn(CheckResultModel, 'updateOne')
      .mockReturnValue({ exec: updateExec } as never);
    vi.spyOn(CheckResultModel, 'findOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue(persistedDocument()),
    } as never);
    const repository = new MongooseCheckResultRepository();

    const result = await repository.saveIdempotently(input);

    expect(updateOne).toHaveBeenCalledWith(
      {
        monitorId: input.monitorId,
        region: input.region,
        scheduledAt: input.scheduledAt,
      },
      { $setOnInsert: input },
      { upsert: true, runValidators: true },
    );
    expect(result).toMatchObject({
      id: '000000000000000000000003',
      monitorId: input.monitorId,
      region: 'mumbai',
    });
  });

  it('recovers a duplicate-key race by loading the winning record', async () => {
    vi.spyOn(CheckResultModel, 'updateOne').mockReturnValue({
      exec: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11_000 })),
    } as never);
    vi.spyOn(CheckResultModel, 'findOne').mockReturnValue({
      exec: vi.fn().mockResolvedValue(persistedDocument()),
    } as never);
    const repository = new MongooseCheckResultRepository();

    await expect(repository.saveIdempotently(input)).resolves.toMatchObject({
      id: '000000000000000000000003',
    });
  });

  it('propagates non-duplicate persistence failures', async () => {
    vi.spyOn(CheckResultModel, 'updateOne').mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('MongoDB unavailable')),
    } as never);
    const repository = new MongooseCheckResultRepository();

    await expect(repository.saveIdempotently(input)).rejects.toThrow('MongoDB unavailable');
  });

  it('loads bounded recent regional history newest first', async () => {
    const exec = vi.fn().mockResolvedValue([persistedDocument()]);
    const limit = vi.fn().mockReturnValue({ exec });
    const sort = vi.fn().mockReturnValue({ limit });
    const find = vi.spyOn(CheckResultModel, 'find').mockReturnValue({ sort } as never);
    const repository = new MongooseCheckResultRepository();

    const results = await repository.listRecentByRegion(input.monitorId, input.region, 3);

    expect(find).toHaveBeenCalledWith({ monitorId: input.monitorId, region: input.region });
    expect(sort).toHaveBeenCalledWith({ scheduledAt: -1 });
    expect(limit).toHaveBeenCalledWith(3);
    expect(results).toHaveLength(1);
  });

  it('uses the same owner-scoped range and region filter for history rows and count', async () => {
    const resultExec = vi.fn().mockResolvedValue([persistedDocument()]);
    const select = vi.fn().mockReturnValue({ exec: resultExec });
    const limit = vi.fn().mockReturnValue({ select });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    const find = vi.spyOn(CheckResultModel, 'find').mockReturnValue({ sort } as never);
    const countExec = vi.fn().mockResolvedValue(1);
    const countDocuments = vi
      .spyOn(CheckResultModel, 'countDocuments')
      .mockReturnValue({ exec: countExec } as never);
    const repository = new MongooseCheckResultRepository();

    const page = await repository.listOwnedHistory({
      ...ownedRange,
      region: 'mumbai',
      skip: 50,
      limit: 25,
    });

    const filter = {
      userId: input.userId,
      monitorId: input.monitorId,
      region: 'mumbai',
      scheduledAt: { $gte: ownedRange.from, $lte: ownedRange.to },
    };
    expect(find).toHaveBeenCalledWith(filter);
    expect(countDocuments).toHaveBeenCalledWith(filter);
    expect(sort).toHaveBeenCalledWith({ scheduledAt: -1, _id: -1 });
    expect(skip).toHaveBeenCalledWith(50);
    expect(limit).toHaveBeenCalledWith(25);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: 1, success: 1, latencyMs: 1 }),
    );
    expect(page).toMatchObject({ total: 1, checks: [{ id: '000000000000000000000003' }] });
  });

  it('aggregates owner-scoped regional counts and latency totals in MongoDB', async () => {
    const aggregateExec = vi.fn().mockResolvedValue([
      {
        _id: 'mumbai',
        totalChecks: 2,
        successfulChecks: 1,
        latencySampleCount: 2,
        latencyTotalMs: 400,
      },
    ]);
    const aggregate = vi
      .spyOn(CheckResultModel, 'aggregate')
      .mockReturnValue({ exec: aggregateExec } as never);
    const repository = new MongooseCheckResultRepository();

    const result = await repository.summarizeOwnedRange(ownedRange);

    expect(aggregate).toHaveBeenCalledWith([
      {
        $match: {
          userId: new Types.ObjectId(input.userId),
          monitorId: new Types.ObjectId(input.monitorId),
          scheduledAt: { $gte: ownedRange.from, $lte: ownedRange.to },
        },
      },
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
    ]);
    expect(result).toEqual([
      {
        region: 'mumbai',
        totalChecks: 2,
        successfulChecks: 1,
        latencySampleCount: 2,
        latencyTotalMs: 400,
      },
    ]);
  });

  it('loads only projected non-null latency values for percentile calculation', async () => {
    const exec = vi.fn().mockResolvedValue([{ latencyMs: 100 }, { latencyMs: 300 }]);
    const lean = vi.fn().mockReturnValue({ exec });
    const select = vi.fn().mockReturnValue({ lean });
    const find = vi.spyOn(CheckResultModel, 'find').mockReturnValue({ select } as never);
    const repository = new MongooseCheckResultRepository();

    const values = await repository.listOwnedLatencyValues(ownedRange);

    expect(find).toHaveBeenCalledWith({
      userId: input.userId,
      monitorId: input.monitorId,
      scheduledAt: { $gte: ownedRange.from, $lte: ownedRange.to },
      latencyMs: { $ne: null },
    });
    expect(select).toHaveBeenCalledWith({ _id: 0, latencyMs: 1 });
    expect(values).toEqual([100, 300]);
  });

  it('loads one projected latest result for each current region with ownership defense', async () => {
    const exec = vi.fn().mockResolvedValue(persistedDocument());
    const select = vi.fn().mockReturnValue({ exec });
    const sort = vi.fn().mockReturnValue({ select });
    const findOne = vi.spyOn(CheckResultModel, 'findOne').mockReturnValue({ sort } as never);
    const repository = new MongooseCheckResultRepository();

    const results = await repository.listLatestOwnedByRegions(ownedRange, ['mumbai']);

    expect(findOne).toHaveBeenCalledWith({
      userId: input.userId,
      monitorId: input.monitorId,
      region: 'mumbai',
      scheduledAt: { $gte: ownedRange.from, $lte: ownedRange.to },
    });
    expect(sort).toHaveBeenCalledWith({ scheduledAt: -1, _id: -1 });
    expect(select).toHaveBeenCalledWith({
      region: 1,
      scheduledAt: 1,
      success: 1,
      statusCode: 1,
      latencyMs: 1,
      errorType: 1,
    });
    expect(results).toHaveLength(1);
  });
});
