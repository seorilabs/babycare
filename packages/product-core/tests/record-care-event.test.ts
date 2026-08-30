import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  babyId,
  createRecordCareEvent,
  eventId,
  groupId,
  userId,
  type AnalyticsPort,
  type BabyCareAnalyticsEvent,
  type StringStoragePort,
} from '../src/index.ts';
import {InMemoryCareEventRepository} from '../src/testing/index.ts';

class MemoryStorage implements StringStoragePort {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('record care event use case', () => {
  it('emits the create event every time and marks only the user first log', async () => {
    const repository = new InMemoryCareEventRepository();
    const storage = new MemoryStorage();
    const tracked: BabyCareAnalyticsEvent[] = [];
    let sequence = 0;
    const record = createRecordCareEvent({
      repository,
      analytics: {track: async event => { tracked.push(event); }},
      firstLogStorage: storage,
      groupRole: 'owner',
      clock: {now: () => 10_000},
      idGenerator: {nextEventId: () => eventId(`event-${++sequence}`)},
    });
    const context = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('user-1'),
    };

    await record({...context, kind: 'diaper', diaperType: 'wet', occurredAt: 9_000});
    await record({
      ...context,
      babyId: babyId('baby-2'),
      kind: 'feeding',
      feedingType: 'formula',
      volumeMl: 90,
      occurredAt: 9_500,
    });

    assert.equal(
      (await repository.list({groupId: context.groupId, babyId: context.babyId})).length,
      1,
    );
    assert.equal(
      (await repository.list({groupId: context.groupId, babyId: babyId('baby-2')})).length,
      1,
    );
    assert.deepEqual(tracked, [
      {name: 'bc_log_create', params: {type: 'diaper', is_first: true, group_role: 'owner'}},
      {name: 'bc_log_create', params: {type: 'feeding', is_first: false, group_role: 'owner'}},
    ]);
  });

  it('does not report a successful local write as failed when analytics is unavailable', async () => {
    const repository = new InMemoryCareEventRepository();
    const record = createRecordCareEvent({
      repository,
      analytics: {track: async () => Promise.reject(new Error('offline'))},
      firstLogStorage: new MemoryStorage(),
      groupRole: 'member',
      clock: {now: () => 10_000},
      idGenerator: {nextEventId: () => eventId('event-offline-analytics')},
    });
    const context = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('user-1'),
    };

    await assert.doesNotReject(
      record({...context, kind: 'diaper', diaperType: 'wet', occurredAt: 9_000}),
    );
    assert.equal((await repository.list(context)).length, 1);
  });

  it('does not mark another event first after the original was soft-deleted', async () => {
    const repository = new InMemoryCareEventRepository();
    const tracked: BabyCareAnalyticsEvent[] = [];
    let sequence = 0;
    let now = 10_000;
    const record = createRecordCareEvent({
      repository,
      analytics: {track: async event => { tracked.push(event); }},
      firstLogStorage: new MemoryStorage(),
      groupRole: 'owner',
      clock: {now: () => now},
      idGenerator: {nextEventId: () => eventId(`event-${++sequence}`)},
    });
    const context = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('user-1'),
    };
    const first = await record({...context, kind: 'diaper', diaperType: 'wet', occurredAt: 9_000});
    now += 1;
    await repository.save({...first, deletedAt: now, updatedAt: now, revision: 2});
    await record({...context, kind: 'diaper', diaperType: 'dirty', occurredAt: 9_500});

    assert.deepEqual(
      tracked.map(event => event.name === 'bc_log_create' && event.params.is_first),
      [true, false],
    );
  });

  it('keeps the care write when first-log marker storage fails', async () => {
    const repository = new InMemoryCareEventRepository();
    const tracked: BabyCareAnalyticsEvent[] = [];
    const record = createRecordCareEvent({
      repository,
      analytics: {track: async event => { tracked.push(event); }},
      firstLogStorage: {
        getItem: async () => Promise.reject(new Error('storage unavailable')),
        setItem: async () => Promise.reject(new Error('storage unavailable')),
        removeItem: async () => undefined,
      },
      groupRole: 'member',
      clock: {now: () => 10_000},
      idGenerator: {nextEventId: () => eventId('event-storage-failure')},
    });

    await assert.doesNotReject(
      record({
        groupId: groupId('group-1'),
        babyId: babyId('baby-1'),
        caregiverId: userId('user-1'),
        kind: 'diaper',
        diaperType: 'wet',
        occurredAt: 9_000,
      }),
    );
    assert.equal(
      (
        await repository.list({
          groupId: groupId('group-1'),
          babyId: babyId('baby-1'),
        })
      ).length,
      1,
    );
    assert.deepEqual(tracked[0], {
      name: 'bc_log_create',
      params: {type: 'diaper', is_first: false, group_role: 'member'},
    });
  });

  it('serializes local writes and allows only one active sleep session', async () => {
    const repository = new InMemoryCareEventRepository();
    let sequence = 0;
    const record = createRecordCareEvent({
      repository,
      analytics: {track: async () => undefined},
      firstLogStorage: new MemoryStorage(),
      groupRole: 'owner',
      clock: {now: () => 10_000},
      idGenerator: {nextEventId: () => eventId(`sleep-${++sequence}`)},
    });
    const context = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('user-1'),
    };

    const results = await Promise.allSettled([
      record({...context, kind: 'sleep', sleepType: 'nap', startedAt: 9_000}),
      record({...context, kind: 'sleep', sleepType: 'nap', startedAt: 9_500}),
    ]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await repository.list(context)).length, 1);
  });
});
