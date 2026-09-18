import { z } from 'zod';

export const DEFAULT_TIME_RANGE_MS = 24 * 60 * 60 * 1_000;
export const MAX_TIME_RANGE_MS = 30 * 24 * 60 * 60 * 1_000;

const isoTimestampSchema = z.iso.datetime({
  offset: true,
  message: 'must be an ISO-8601 timestamp with a timezone',
});

export const timeRangeQueryShape = {
  from: isoTimestampSchema.optional(),
  to: isoTimestampSchema.optional(),
};

export const timeRangeQuerySchema = z.strictObject(timeRangeQueryShape);

export interface EffectiveTimeRange {
  from: Date;
  to: Date;
}

export function createEffectiveTimeRangeSchema(now: Date) {
  return timeRangeQuerySchema.transform((input, context): EffectiveTimeRange | typeof z.NEVER => {
    const to = input.to === undefined ? new Date(now) : new Date(input.to);
    const from =
      input.from === undefined ? new Date(to.getTime() - DEFAULT_TIME_RANGE_MS) : new Date(input.from);

    if (from.getTime() > to.getTime()) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'must be earlier than or equal to to',
      });
      return z.NEVER;
    }

    if (to.getTime() - from.getTime() > MAX_TIME_RANGE_MS) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'time range must not exceed 30 days',
      });
      return z.NEVER;
    }

    return { from, to };
  });
}
