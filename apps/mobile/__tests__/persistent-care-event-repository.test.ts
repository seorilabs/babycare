import {
  babyId,
  createCareEvent,
  createSoftDeleteCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
} from '@babycare/product-core';

import {
  isPersistedCareEvent,
  PersistentCareEventRepository,
} from '../src/adapters/local/persistent-care-event-repository';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

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

describe('PersistentCareEventRepository observation', () => {
  it('emits the filtered snapshot before a soft-delete operation resolves', async () => {
    const repository = new PersistentCareEventRepository();
    const snapshots: (readonly CareEvent[])[] = [];
    const unsubscribe = repository.observe(ids, events => snapshots.push(events));
    const event = createCareEvent(
      {...ids, kind: 'diaper', diaperType: 'wet', occurredAt: 1_000},
      {id: eventId('event-observed-delete'), now: 2_000},
    );
    await repository.save(event);
    const softDelete = createSoftDeleteCareEvent({
      repository,
      clock: {now: () => 3_000},
      analytics: {track: async () => undefined},
    });

    await softDelete({
      groupId: ids.groupId,
      eventId: event.id,
      requestedBy: ids.caregiverId,
    });

    expect(snapshots.at(-1)).toEqual([]);
    unsubscribe();
  });
});
