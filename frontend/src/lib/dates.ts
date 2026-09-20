const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const exactTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const exactTimeWithSeconds = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export function formatExactDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : exactTime.format(date);
}

export function formatRelativeDate(value: string | null, now = new Date()): string {
  if (value === null) return 'Not checked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const seconds = Math.round((date.getTime() - now.getTime()) / 1_000);
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 60) return relativeTime.format(seconds, 'second');
  if (absoluteSeconds < 3_600) return relativeTime.format(Math.round(seconds / 60), 'minute');
  if (absoluteSeconds < 86_400) return relativeTime.format(Math.round(seconds / 3_600), 'hour');
  if (absoluteSeconds < 604_800) return relativeTime.format(Math.round(seconds / 86_400), 'day');
  return formatExactDate(value);
}

export function formatExactDateWithSeconds(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : exactTimeWithSeconds.format(date);
}

export function formatDuration(openedAt: string, resolvedAt: string | null): string {
  if (resolvedAt === null) return 'Ongoing';

  const start = new Date(openedAt).getTime();
  const end = new Date(resolvedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'Unknown';

  const totalSeconds = Math.floor((end - start) / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${String(days)}d ${String(hours)}h`;
  if (hours > 0) return `${String(hours)}h ${String(minutes)}m`;
  if (minutes > 0) return `${String(minutes)}m ${String(seconds)}s`;
  return `${String(seconds)}s`;
}
