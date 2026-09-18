import { describe, expect, it } from 'vitest';

import {
  incidentAiResultSchema,
  monitorHealthAiResultSchema,
} from '../../src/modules/ai/ai-contracts';

describe('AI result contracts', () => {
  it('accepts bounded strict monitor and incident results with caveats', () => {
    expect(
      monitorHealthAiResultSchema.safeParse({
        summary: 'Mostly healthy.',
        observations: ['One failure was observed.'],
        regionalFindings: [],
        latencyFindings: [],
        reliabilityRisk: 'low',
        caveats: ['The analysis uses only the supplied time window.'],
      }).success,
    ).toBe(true);
    expect(
      incidentAiResultSchema.safeParse({
        summary: 'The incident was brief.',
        timelineSummary: 'Failures preceded recovery.',
        affectedRegions: ['mumbai'],
        likelyPattern: 'A multi-region timeout pattern is possible.',
        evidence: ['Two failures were recorded.'],
        caveats: ['The root cause is not confirmed.'],
      }).success,
    ).toBe(true);
  });

  it('requires caveats and rejects unknown keys, excessive arrays, and long strings', () => {
    const base = {
      summary: 'summary',
      observations: [],
      regionalFindings: [],
      latencyFindings: [],
      reliabilityRisk: 'unknown',
      caveats: [] as string[],
    };

    expect(monitorHealthAiResultSchema.safeParse(base).success).toBe(false);
    expect(
      monitorHealthAiResultSchema.safeParse({
        ...base,
        caveats: ['caveat'],
        observations: Array.from({ length: 11 }, () => 'finding'),
      }).success,
    ).toBe(false);
    expect(
      monitorHealthAiResultSchema.safeParse({
        ...base,
        summary: 'x'.repeat(1_501),
        caveats: ['caveat'],
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
