import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
} from '../src/index.ts';

const ids = {
  groupId: groupId('group-1'),
  babyId: babyId('baby-1'),
  caregiverId: userId('user-1'),
};

describe('createCareEvent', () => {
  it('creates a canonical bottle feeding record in milliliters', () => {
    const event = createCareEvent(
      {
        ...ids,
        kind: 'feeding',
        feedingType: 'formula',
        volumeMl: 120,
        occurredAt: 1_000,
        note: '  잘 먹음  ',
      },
      { id: eventId('event-1'), now: 2_000 },
    );

    assert.equal(event.kind, 'feeding');
    if (event.kind !== 'feeding') {
      assert.fail('Expected a feeding event');
    }
    assert.equal(event.volumeMl, 120);
    assert.equal(event.note, '잘 먹음');
    assert.equal(event.revision, 1);
  });

  it('requires side and a positive duration for breastfeeding', () => {
    assert.throws(
      () =>
        createCareEvent(
          {
            ...ids,
            kind: 'feeding',
            feedingType: 'breast',
            leftDurationSeconds: 0,
            occurredAt: 1_000,
          },
          { id: eventId('event-2'), now: 2_000 },
        ),
      /leftDurationSeconds/,
    );
  });

  it('stores left and right breastfeeding timers independently', () => {
    const event = createCareEvent(
      {
        ...ids,
        kind: 'feeding',
        feedingType: 'breast',
        leftDurationSeconds: 120,
        rightDurationSeconds: 90,
        occurredAt: 1_000,
      },
      {id: eventId('event-breast'), now: 2_000},
    );
    assert.equal(event.kind, 'feeding');
    if (event.kind !== 'feeding') {
      assert.fail('Expected a feeding event');
    }
    assert.equal(event.leftDurationSeconds, 120);
    assert.equal(event.rightDurationSeconds, 90);
  });

  it('models sleep as a session and rejects inverted ranges', () => {
    assert.throws(
      () =>
        createCareEvent(
          {
            ...ids,
            kind: 'sleep',
            sleepType: 'nap',
            startedAt: 5_000,
            endedAt: 4_000,
          },
          { id: eventId('event-3'), now: 6_000 },
        ),
      /endedAt must be after startedAt/,
    );

    assert.throws(
      () =>
        createCareEvent(
          {
            ...ids,
            kind: 'sleep',
            sleepType: 'nap',
            startedAt: 5_000,
            endedAt: 6_001,
          },
          {id: eventId('event-future-end'), now: 6_000},
        ),
      /endedAt must not be in the future/,
    );
  });

  it('rejects records more than five minutes in the future', () => {
    assert.throws(
      () =>
        createCareEvent(
          {
            ...ids,
            kind: 'diaper',
            diaperType: 'mixed',
            occurredAt: 301_001,
          },
          { id: eventId('event-4'), now: 1_000 },
        ),
      /too far in the future/,
    );
  });

  it('rejects invalid discriminated values at the runtime boundary', () => {
    assert.throws(
      () =>
        createCareEvent(
          {
            ...ids,
            kind: 'diaper',
            diaperType: 'unknown',
            occurredAt: 1_000,
          } as never,
          {id: eventId('event-5'), now: 2_000},
        ),
      /diaperType/,
    );
  });
});
