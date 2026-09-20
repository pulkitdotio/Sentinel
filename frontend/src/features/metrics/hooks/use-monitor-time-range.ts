import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  createIsoTimeRange,
  normalizeTimeRangePreset,
  type TimeRangePreset,
} from '../time-range';

export function useMonitorTimeRange() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawRange = searchParams.get('range');
  const preset = normalizeTimeRangePreset(rawRange);
  const range = useMemo(() => createIsoTimeRange(preset), [preset]);

  useEffect(() => {
    if (rawRange === preset) return;
    const next = new URLSearchParams(searchParams);
    next.set('range', preset);
    setSearchParams(next, { replace: true });
  }, [preset, rawRange, searchParams, setSearchParams]);

  const setPreset = (nextPreset: TimeRangePreset) => {
    const next = new URLSearchParams(searchParams);
    next.set('range', nextPreset);
    next.delete('page');
    setSearchParams(next);
  };

  return { preset, range, setPreset };
}
