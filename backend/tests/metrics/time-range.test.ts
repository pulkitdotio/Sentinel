import { describe, expect, it } from 'vitest';

import {
  createEffectiveTimeRangeSchema,
  MAX_TIME_RANGE_MS,
} from '../../src/modules/metrics/time-range';

const NOW = new Date('2026-02-01T12:00:00.000Z');

describe('Phase 6 time-range normalization', () => {
  it('defaults to the 24 hours ending at the injected current time', () => {
    const range = createEffectiveTimeRangeSchema(NOW).parse({});

    expect(range.from.toISOString()).toBe('2026-01-31T12:00:00.000Z');
    expect(range.to.toISOString()).toBe(NOW.toISOString());
  });

  it('uses an explicit from and to and normalizes offsets to UTC', () => {
    const range = createEffectiveTimeRangeSchema(NOW).parse({
      from: '2026-01-01T05:30:00+05:30',
      to: '2026-01-02T05:30:00+05:30',
    });

    expect(range.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('uses now as to when only from is supplied', () => {
    const range = createEffectiveTimeRangeSchema(NOW).parse({
      from: '2026-01-31T00:00:00.000Z',
    });

    expect(range.from.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(range.to.toISOString()).toBe(NOW.toISOString());
  });

  it('uses the preceding 24 hours when only to is supplied', () => {
    const range = createEffectiveTimeRangeSchema(NOW).parse({
      to: '2026-01-15T08:00:00.000Z',
    });

    expect(range.from.toISOString()).toBe('2026-01-14T08:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });

  it('rejects malformed timestamps and unknown query parameters', () => {
    expect(createEffectiveTimeRangeSchema(NOW).safeParse({ from: 'yesterday' }).success).toBe(
      false,
    );
    expect(createEffectiveTimeRangeSchema(NOW).safeParse({ window: '24h' }).success).toBe(false);
  });

  it('rejects from after to', () => {
    const result = createEffectiveTimeRangeSchema(NOW).safeParse({
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a range longer than 30 days', () => {
    const result = createEffectiveTimeRangeSchema(NOW).safeParse({
      from: '2026-01-01T00:00:00.000Z',
      to: new Date(new Date('2026-01-01T00:00:00.000Z').getTime() + MAX_TIME_RANGE_MS + 1)
        .toISOString(),
    });

    expect(result.success).toBe(false);
  });

  it('accepts a range of exactly 30 days', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const result = createEffectiveTimeRangeSchema(NOW).safeParse({
      from: from.toISOString(),
      to: new Date(from.getTime() + MAX_TIME_RANGE_MS).toISOString(),
    });

    expect(result.success).toBe(true);
  });
});
