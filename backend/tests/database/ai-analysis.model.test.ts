import { describe, expect, it } from 'vitest';

import { AiAnalysisModel } from '../../src/database/models/ai-analysis';

const baseAnalysis = {
  userId: '000000000000000000000001',
  type: 'monitor_health',
  monitorId: '000000000000000000000002',
  incidentId: null,
  status: 'queued',
  inputWindow: {
    from: new Date('2026-09-18T00:00:00.000Z'),
    to: new Date('2026-09-19T00:00:00.000Z'),
  },
  result: null,
  failureCode: null,
  completedAt: null,
};

describe('AiAnalysis model', () => {
  it('defines exactly the documented lookup indexes without TTL behavior', () => {
    const indexes = AiAnalysisModel.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ userId: 1, createdAt: -1 }, expect.any(Object)],
        [{ monitorId: 1, createdAt: -1 }, expect.any(Object)],
        [{ incidentId: 1, createdAt: -1 }, expect.any(Object)],
      ]),
    );
    expect(indexes).toHaveLength(3);
    expect(indexes.some(([, options]) => 'expireAfterSeconds' in options)).toBe(false);
  });

  it('accepts the queued state and rejects an unknown failure code', async () => {
    await expect(new AiAnalysisModel(baseAnalysis).validate()).resolves.toBeUndefined();
    await expect(
      new AiAnalysisModel({ ...baseAnalysis, status: 'failed', failureCode: 'RAW_ERROR' }).validate(),
    ).rejects.toThrow();
  });

  it('rejects unbounded or malformed persisted provider output', async () => {
    const malformed = new AiAnalysisModel({
      ...baseAnalysis,
      status: 'completed',
      result: {
        summary: 'x'.repeat(1_501),
        observations: [],
        regionalFindings: [],
        latencyFindings: [],
        reliabilityRisk: 'low',
        caveats: [],
      },
    });

    await expect(malformed.validate()).rejects.toThrow(
      'must be a valid bounded AI analysis result',
    );
  });
});
