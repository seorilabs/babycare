import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
} from '@babycare/product-core';

import { buildStatsBuckets } from '../src/screens/StatsScreen';

describe('buildStatsBuckets', () => {
  it('clips active sleep at the real current time in the rolling 12-hour range', () => {
    const now = new Date('2026-07-12T12:37:00+09:00').getTime();
    const sleep = createCareEvent(
      {
        groupId: groupId('group-1'),
        babyId: babyId('baby-1'),
        caregiverId: userId('user-1'),
        kind: 'sleep',
        sleepType: 'nap',
        startedAt: now - 3 * 60 * 60 * 1_000,
      },
      { id: eventId('event-1'), now },
    );

    const buckets = buildStatsBuckets([sleep], now, '12h');

    expect(buckets[0]?.from).toBe(now - 12 * 60 * 60 * 1_000);
    expect(buckets.at(-1)?.to).toBe(now);
    expect(
      buckets.reduce(
        (total, bucket) => total + bucket.summary.sleepDurationSeconds,
        0,
      ),
    ).toBe(3 * 60 * 60);
  });

  it('keeps the current calendar bucket empty at exact midnight', () => {
    const now = new Date('2026-07-12T00:00:00+09:00').getTime();

    const buckets = buildStatsBuckets([], now, '7d');

    expect(buckets).toHaveLength(7);
    expect(buckets.at(-1)?.from).toBe(now);
    expect(buckets.at(-1)?.to).toBe(now);
    expect(buckets.at(-1)?.summary.sleepDurationSeconds).toBe(0);
  });
});
