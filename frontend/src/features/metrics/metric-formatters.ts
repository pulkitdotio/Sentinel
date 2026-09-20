const integerFormat = new Intl.NumberFormat();
const decimalFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function formatCount(value: number): string {
  return integerFormat.format(value);
}

export function formatPercentage(value: number | null): string {
  return value === null ? '—' : `${decimalFormat.format(value)}%`;
}

export function formatLatency(value: number | null): string {
  return value === null ? '—' : `${decimalFormat.format(value)} ms`;
}

export function regionLabel(region: string): string {
  return region
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
