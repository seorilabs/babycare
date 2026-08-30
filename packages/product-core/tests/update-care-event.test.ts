import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  babyId,
  createCareEvent,
  createSoftDeleteCareEvent,
  createUpdateCareEvent,
  eventId,
  groupId,
  userId,
  type BabyCareAnalyticsEvent,
  type CreateCareEventInput,
} from '../src/index.ts';
import {InMemoryCareEventRepository} from '../src/testing/index.ts';

function existingDiaper() {
  return createCareEvent(
    {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('caregiver-1'),
      kind: 'diaper',
      diaperType: 'wet',
      note: 'before',
      occurredAt: 10_000,
    },
    {id: eventId('event-1'), now: 20_000},
  );
}

describe('update care event use case', () => {
  it('updates mutable values while preserving identity and increasing revision', async () => {
    const event = existingDiaper();
    const repository = new InMemoryCareEventRepository([event]);
    const tracked: BabyCareAnalyticsEvent[] = [];
    const update = createUpdateCareEvent({
      repository,
      clock: {now: () => 30_000},
      analytics: {track: async value => { tracked.push(value); }},
    });

    const result = await update({
      groupId: event.groupId,
      eventId: event.id,
      requestedBy: userId('caregiver-2'),
      update: {
        groupId: event.groupId,
        babyId: event.babyId,
        caregiverId: event.caregiverId,
        kind: 'diaper',
        diaperType: 'dirty',
        note: 'after',
        occurredAt: 11_000,
      },
    });

    assert.equal(result.createdAt, event.createdAt);
    assert.equal(result.updatedAt, 30_000);
    assert.equal(result.revision, 2);
    assert.equal(result.kind, 'diaper');
    if (result.kind !== 'diaper') {
      throw new Error('Expected a diaper event');
    }
    assert.equal(result.diaperType, 'dirty');
    assert.equal(result.note, 'after');
    assert.equal(result.caregiverId, event.caregiverId);
    assert.deepEqual(tracked, [{name: 'bc_log_update', params: {type: 'diaper'}}]);
  });

  it('rejects immutable metadata and identity changes', async () => {
    const event = existingDiaper();
    const repository = new InMemoryCareEventRepository([event]);
    const update = createUpdateCareEvent({
      repository,
      clock: {now: () => 30_000},
      analytics: {track: async () => undefined},
    });
    const valid: CreateCareEventInput = {
      groupId: event.groupId,
      babyId: event.babyId,
      caregiverId: event.caregiverId,
      kind: 'diaper',
      diaperType: 'dirty',
      occurredAt: 11_000,
    };

    await assert.rejects(
      update({
        groupId: event.groupId,
        eventId: event.id,
        requestedBy: event.caregiverId,
        update: {...valid, createdAt: 1} as CreateCareEventInput,
      }),
      /immutable metadata/,
    );
    await assert.rejects(
      update({
        groupId: event.groupId,
        eventId: event.id,
        requestedBy: event.caregiverId,
        update: {...valid, babyId: babyId('baby-2')},
      }),
      /identity cannot be changed/,
    );
  });

  it('reuses creation validation and rejects invalid field values', async () => {
    const event = createCareEvent(
      {
        groupId: groupId('group-1'),
        babyId: babyId('baby-1'),
        caregiverId: userId('caregiver-1'),
        kind: 'feeding',
        feedingType: 'formula',
        volumeMl: 90,
        occurredAt: 10_000,
      },
      {id: eventId('feeding-1'), now: 20_000},
    );
    const repository = new InMemoryCareEventRepository([event]);
    const update = createUpdateCareEvent({
      repository,
      clock: {now: () => 30_000},
      analytics: {track: async () => undefined},
    });

    await assert.rejects(
      update({
        groupId: event.groupId,
        eventId: event.id,
        requestedBy: event.caregiverId,
        update: {
          groupId: event.groupId,
          babyId: event.babyId,
          caregiverId: event.caregiverId,
          kind: 'feeding',
          feedingType: 'formula',
          volumeMl: 2_001,
          occurredAt: 10_000,
        },
      }),
      /volumeMl/,
    );
  });

  it('rejects deleted records and clock rollback', async () => {
    const event = existingDiaper();
    const deleted = {...event, deletedAt: 21_000, updatedAt: 21_000, revision: 2};
    const deletedUpdate = createUpdateCareEvent({
      repository: new InMemoryCareEventRepository([deleted]),
      clock: {now: () => 30_000},
      analytics: {track: async () => undefined},
    });
    const input: CreateCareEventInput = {
      groupId: event.groupId,
      babyId: event.babyId,
      caregiverId: event.caregiverId,
      kind: 'diaper',
      diaperType: 'dirty',
      occurredAt: 10_000,
    };

    await assert.rejects(
      deletedUpdate({
        groupId: event.groupId,
        eventId: event.id,
        requestedBy: event.caregiverId,
        update: input,
      }),
      /not found/,
    );

    const rollbackUpdate = createUpdateCareEvent({
      repository: new InMemoryCareEventRepository([event]),
      clock: {now: () => 19_999},
      analytics: {track: async () => undefined},
    });
    await assert.rejects(
      rollbackUpdate({
        groupId: event.groupId,
        eventId: event.id,
        requestedBy: event.caregiverId,
        update: input,
      }),
      /clock moved/,
    );
  });

  it('does not roll back a successful update when analytics fails', async () => {
    const event = existingDiaper();
    const repository = new InMemoryCareEventRepository([event]);
    const update = createUpdateCareEvent({
      repository,
      clock: {now: () => 30_000},
      analytics: {track: async () => Promise.reject(new Error('offline'))},
    });

    await assert.doesNotReject(
      update({
        groupId: event.groupId,
        eventId: event.id,
        requestedBy: userId('caregiver-2'),
        update: {
          groupId: event.groupId,
          babyId: event.babyId,
          caregiverId: event.caregiverId,
          kind: 'diaper',
          diaperType: 'mixed',
          occurredAt: 10_000,
        },
      }),
    );
    assert.equal((await repository.findById(event.groupId, event.id))?.revision, 2);
  });
});

it('allows another active caregiver to soft-delete a record', async () => {
  const event = existingDiaper();
  const repository = new InMemoryCareEventRepository([event]);
  const softDelete = createSoftDeleteCareEvent({
    repository,
    clock: {now: () => 30_000},
    analytics: {track: async () => undefined},
  });

  await assert.doesNotReject(
    softDelete({
      groupId: event.groupId,
      eventId: event.id,
      requestedBy: userId('caregiver-2'),
    }),
  );
  assert.equal((await repository.findById(event.groupId, event.id))?.revision, 2);
});

it('refuses to soft-delete when the system clock moved behind the last update', async () => {
  const event = existingDiaper();
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
