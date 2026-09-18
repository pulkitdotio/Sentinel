import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { CheckResultModel } from '../../src/database/models/check-result';

function validInput(): Record<string, unknown> {
  return {
    userId: new Types.ObjectId(),
    monitorId: new Types.ObjectId(),
    region: 'mumbai',
    scheduledAt: new Date('2026-01-01T00:00:00.000Z'),
    startedAt: new Date('2026-01-01T00:00:00.100Z'),
    completedAt: new Date('2026-01-01T00:00:00.250Z'),
    success: true,
    statusCode: 200,
    latencyMs: 145,
    errorType: null,
  };
}

describe('CheckResult model', () => {
  it('defines the documented unique identity and query indexes', () => {
    const indexes = CheckResultModel.schema.indexes();

    expect(indexes).toContainEqual([
      { monitorId: 1, region: 1, scheduledAt: 1 },
      { unique: true, background: true },
    ]);
    expect(indexes.map(([fields]) => fields)).toContainEqual({
      userId: 1,
      monitorId: 1,
      scheduledAt: -1,
    });
    expect(indexes.map(([fields]) => fields)).toContainEqual({
      monitorId: 1,
      region: 1,
      scheduledAt: -1,
    });
  });

  it('uses createdAt without an updatedAt or TTL index', () => {
    expect(CheckResultModel.schema.options.timestamps).toEqual({
      createdAt: true,
      updatedAt: false,
    });
    expect(CheckResultModel.schema.path('updatedAt')).toBeUndefined();
    expect(
      CheckResultModel.schema.indexes().some(([, options]) => 'expireAfterSeconds' in options),
    ).toBe(false);
  });

  it('accepts a documented successful result', async () => {
    const result = new CheckResultModel(validInput());

    await expect(result.validate()).resolves.toBeUndefined();
  });

  it('validates error type, status code, latency, and compact metadata', async () => {
    const result = new CheckResultModel({
      ...validInput(),
      statusCode: 99,
      latencyMs: -1,
      errorType: 'not-documented',
      errorMetadata: { code: 'x'.repeat(65) },
    });

    await expect(result.validate()).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('contains no response body field', () => {
    expect(CheckResultModel.schema.path('body')).toBeUndefined();
    expect(CheckResultModel.schema.path('responseBody')).toBeUndefined();
  });
});
