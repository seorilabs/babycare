import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
} from '@babycare/product-core';

import {isPersistedCareEvent} from '../src/adapters/local/persistent-care-event-repository';

const ids = {
  groupId: groupId('group-1'),
  babyId: babyId('baby-1'),
  caregiverId: userId('user-1'),
};

describe('isPersistedCareEvent', () => {
  it('accepts current canonical records and rejects corrupt or legacy payloads', () => {
    const feeding = createCareEvent(
      {
        ...ids,
        kind: 'feeding',
        feedingType: 'breast',
        leftDurationSeconds: 120,
        rightDurationSeconds: 90,
        occurredAt: 1_000,
      },
      {id: eventId('event-1'), now: 2_000},
    );

    expect(isPersistedCareEvent(feeding)).toBe(true);
    expect(
      isPersistedCareEvent({
        ...feeding,
        breastSide: 'left',
        durationSeconds: 210,
      }),
    ).toBe(false);
    expect(isPersistedCareEvent({...feeding, updatedAt: Number.NaN})).toBe(false);
  });

  it('rejects impossible sleep audit ranges', () => {
    const sleep = createCareEvent(
      {
        ...ids,
        kind: 'sleep',
        sleepType: 'night',
        startedAt: 1_000,
      },
      {id: eventId('event-2'), now: 2_000},
    );

    expect(
      isPersistedCareEvent({...sleep, endedAt: 2_001}),
    ).toBe(false);
  });
});
