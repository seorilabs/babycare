export type TimeAgoUnit = 'just_now' | 'minute' | 'hour' | 'day';

export interface TimeAgo {
  readonly unit: TimeAgoUnit;
  readonly value: number;
  readonly isFuture: boolean;
}

export function calculateTimeAgo(occurredAt: number, now: number): TimeAgo {
  if (!Number.isFinite(occurredAt) || !Number.isFinite(now)) {
    throw new Error('TimeAgo requires finite timestamps');
  }
  const differenceMs = now - occurredAt;
  const absoluteMinutes = Math.floor(Math.abs(differenceMs) / 60_000);
  const isFuture = differenceMs < 0;

  if (absoluteMinutes < 1) {
    return { unit: 'just_now', value: 0, isFuture };
  }
  if (absoluteMinutes < 60) {
    return { unit: 'minute', value: absoluteMinutes, isFuture };
  }
  const hours = Math.floor(absoluteMinutes / 60);
  if (hours < 24) {
    return { unit: 'hour', value: hours, isFuture };
  }
  return { unit: 'day', value: Math.floor(hours / 24), isFuture };
}
