import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  babyId,
  buildCareStatsBuckets,
  createCareEvent,
  eventId,
  groupId,
  userId,
} from '../src/index.ts';

const ids = {
  groupId: groupId('group-1'),
  babyId: babyId('baby-1'),
  caregiverId: userId('caregiver-1'),
};

describe('buildCareStatsBuckets', () => {
  it('builds caller-defined ranges in order without presentation labels', () => {
    const events = [
      createCareEvent(
        {
          ...ids,
          kind: 'feeding',
          feedingType: 'formula',
          volumeMl: 90,
          occurredAt: 500,
        },
        {id: eventId('feed-1'), now: 500},
      ),
      createCareEvent(
        {
          ...ids,
          kind: 'diaper',
          diaperType: 'wet',
          occurredAt: 1_500,
        },
        {id: eventId('diaper-1'), now: 1_500},
      ),
    ];
    const ranges = [
      {from: 0, to: 1_000},
      {from: 1_000, to: 2_000},
    ] as const;

    const buckets = buildCareStatsBuckets(events, ranges, 2_000);

    assert.deepEqual(
      buckets.map(({from, to}) => ({from, to})),
      ranges,
    );
    assert.equal(buckets[0]?.summary.feedingCount, 1);
    assert.equal(buckets[0]?.summary.diaperCount, 0);
    assert.equal(buckets[1]?.summary.feedingCount, 0);
    assert.equal(buckets[1]?.summary.diaperCount, 1);
    assert.equal('label' in buckets[0]!, false);
  });

  it('uses dashboard overlap rules for sleep in every explicit range', () => {
    const sleep = createCareEvent(
      {
        ...ids,
        kind: 'sleep',
        sleepType: 'nap',
        startedAt: 500,
        endedAt: 1_500,
      },
      {id: eventId('sleep-1'), now: 1_500},
    );

    const buckets = buildCareStatsBuckets(
      [sleep],
      [
        {from: 0, to: 1_000},
        {from: 1_000, to: 2_000},
      ],
      2_000,
    );

    assert.deepEqual(
      buckets.map((bucket) => bucket.summary.sleepDurationSeconds),
      [0.5, 0.5],
    );
  });

  it('rejects an invalid caller-defined range', () => {
    assert.throws(
      () => buildCareStatsBuckets([], [{from: 1_000, to: 1_000}], 1_000),
      /positive duration/,
    );
  });
});
