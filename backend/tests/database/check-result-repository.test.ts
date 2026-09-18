import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CheckResultModel } from '../../src/database/models/check-result';
import {
  MongooseCheckResultRepository,
  type CreateCheckResultRecord,
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
});
