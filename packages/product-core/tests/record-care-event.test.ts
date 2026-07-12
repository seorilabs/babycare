import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  babyId,
  createRecordCareEvent,
  eventId,
  groupId,
  userId,
  type AnalyticsPort,
  type BabyCareAnalyticsEvent,
} from '../src/index.ts';
import { InMemoryCareEventRepository } from '../src/testing/index.ts';

describe('record care event use case', () => {
  it('persists records and emits first-log only once', async () => {
    const repository = new InMemoryCareEventRepository();
    const tracked: BabyCareAnalyticsEvent[] = [];
    const analytics: AnalyticsPort = {
      async track(event) {
        tracked.push(event);
      },
    };
    let sequence = 0;
    const record = createRecordCareEvent({
      repository,
      analytics,
      clock: { now: () => 10_000 },
      idGenerator: { nextEventId: () => eventId(`event-${++sequence}`) },
    });
    const context = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('user-1'),
    };

    await record({
      ...context,
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt: 9_000,
    });
    await record({
      ...context,
      kind: 'feeding',
      feedingType: 'formula',
      volumeMl: 90,
      occurredAt: 9_500,
    });

    const events = await repository.list({ groupId: context.groupId, babyId: context.babyId });
    assert.equal(events.length, 2);
    assert.deepEqual(
      tracked.map((event) => event.name),
      ['bc_first_log', 'bc_log_create'],
    );
  });

  it('does not report a successful local write as failed when analytics is unavailable', async () => {
    const repository = new InMemoryCareEventRepository();
    const record = createRecordCareEvent({
      repository,
      analytics: {track: async () => Promise.reject(new Error('offline'))},
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

  it('does not emit first-log again after the first record was soft-deleted', async () => {
    const repository = new InMemoryCareEventRepository();
    const tracked: BabyCareAnalyticsEvent[] = [];
    let sequence = 0;
    let now = 10_000;
    const record = createRecordCareEvent({
      repository,
      analytics: {
        async track(event) {
          tracked.push(event);
        },
      },
      clock: {now: () => now},
      idGenerator: {nextEventId: () => eventId(`event-${++sequence}`)},
    });
    const context = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('user-1'),
    };

    const first = await record({
      ...context,
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt: 9_000,
    });
    now += 1;
    await repository.save({
      ...first,
      deletedAt: now,
      updatedAt: now,
      revision: 2,
    });
    await record({
      ...context,
      kind: 'diaper',
      diaperType: 'dirty',
      occurredAt: 9_500,
    });

    assert.deepEqual(
      tracked.map(event => event.name),
      ['bc_first_log', 'bc_log_create'],
    );
  });

  it('serializes local writes and allows only one active sleep session', async () => {
    const repository = new InMemoryCareEventRepository();
    let sequence = 0;
    const record = createRecordCareEvent({
      repository,
      analytics: {track: async () => undefined},
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
