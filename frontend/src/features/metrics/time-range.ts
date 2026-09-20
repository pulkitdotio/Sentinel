export const TIME_RANGE_PRESETS = ['1h', '6h', '24h', '7d', '30d'] as const;

export type TimeRangePreset = (typeof TIME_RANGE_PRESETS)[number];

export interface IsoTimeRange {
  from: string;
  to: string;
}

const durations: Record<TimeRangePreset, number> = {
  '1h': 60 * 60 * 1_000,
  '6h': 6 * 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
};

export function normalizeTimeRangePreset(value: string | null): TimeRangePreset {
  return TIME_RANGE_PRESETS.includes(value as TimeRangePreset) ? value as TimeRangePreset : '24h';
}

export function createIsoTimeRange(preset: TimeRangePreset, now = new Date()): IsoTimeRange {
  const to = new Date(now);
  return {
    from: new Date(to.getTime() - durations[preset]).toISOString(),
    to: to.toISOString(),
  };
}
