import type { CareStatsRange } from '@babycare/product-core';

export type StatsPeriod = '12h' | '7d' | '30d';

function shiftLocalDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** Builds display ranges with device-local calendar boundaries. */
export function buildStatsRanges(
  now: number,
  period: StatsPeriod,
): readonly CareStatsRange[] {
  if (period === '12h') {
    const width = 2 * 60 * 60 * 1_000;
    return Array.from({ length: 6 }, (_, index) => {
      const to = now - (5 - index) * width;
      return { from: to - width, to };
    });
  }

  const count = period === '7d' ? 7 : 10;
  const daysPerBucket = period === '7d' ? 1 : 3;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = shiftLocalDays(today.getTime(), 1);
  return Array.from({ length: count }, (_, index) => {
    const bucketEnd = shiftLocalDays(end, -(count - index - 1) * daysPerBucket);
    const from = shiftLocalDays(bucketEnd, -daysPerBucket);
    return { from, to: Math.min(bucketEnd, now) };
  });
}
