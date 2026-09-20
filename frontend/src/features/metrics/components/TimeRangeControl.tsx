import { TIME_RANGE_PRESETS, type TimeRangePreset } from '../time-range';

export function TimeRangeControl({
  value,
  onChange,
}: {
  value: TimeRangePreset;
  onChange: (value: TimeRangePreset) => void;
}) {
  return (
    <fieldset className="time-range-control">
      <legend>Time range</legend>
      {TIME_RANGE_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          aria-pressed={value === preset}
          onClick={() => onChange(preset)}
        >
          {preset}
        </button>
      ))}
    </fieldset>
  );
}
