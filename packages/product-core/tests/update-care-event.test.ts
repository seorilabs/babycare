import assert from 'node:assert/strict';
import {it} from 'node:test';

import {
  babyId,
  createCareEvent,
  createSoftDeleteCareEvent,
  eventId,
  groupId,
  userId,
} from '../src/index.ts';
import {InMemoryCareEventRepository} from '../src/testing/index.ts';

it('refuses to soft-delete when the system clock moved behind the last update', async () => {
  const event = createCareEvent(
    {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('caregiver-1'),
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt: 10_000,
    },
    {id: eventId('event-clock-rollback'), now: 20_000},
  );
  const repository = new InMemoryCareEventRepository([event]);
  const softDelete = createSoftDeleteCareEvent({
    repository,
    clock: {now: () => 19_999},
    analytics: {track: async () => undefined},
  });

  await assert.rejects(
    softDelete({
      groupId: event.groupId,
      eventId: event.id,
      requestedBy: event.caregiverId,
    }),
    /clock moved/,
  );
  assert.equal((await repository.findById(event.groupId, event.id))?.deletedAt, undefined);
});
