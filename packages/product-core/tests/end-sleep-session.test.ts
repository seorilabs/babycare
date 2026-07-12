import assert from 'node:assert/strict';
import { it } from 'node:test';

import {
  babyId,
  createCareEvent,
  createEndSleepSession,
  eventId,
  groupId,
  MAX_SLEEP_DURATION_MS,
  userId,
  type BabyCareAnalyticsEvent,
} from '../src/index.ts';
import { InMemoryCareEventRepository } from '../src/testing/index.ts';

it('ends an active sleep session using wall-clock timestamps', async () => {
  const active = createCareEvent(
    {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('caregiver-1'),
      kind: 'sleep',
      sleepType: 'nap',
      startedAt: 10_000,
    },
    { id: eventId('sleep-1'), now: 10_000 },
  );
  const repository = new InMemoryCareEventRepository([active]);
  const tracked: BabyCareAnalyticsEvent[] = [];
  const endSleep = createEndSleepSession({
    repository,
    clock: { now: () => 70_000 },
    analytics: { track: async (event) => void tracked.push(event) },
  });

  const ended = await endSleep({ groupId: active.groupId, eventId: active.id });

  assert.equal(ended.endedAt, 70_000);
  assert.equal(ended.revision, 2);
  assert.equal(tracked[0]?.name, 'bc_log_update');
});

it('recovers a stale sleep session by capping it at 48 hours', async () => {
  const startedAt = 10_000;
  const active = createCareEvent(
    {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('caregiver-1'),
      kind: 'sleep',
      sleepType: 'night',
      startedAt,
    },
    {id: eventId('sleep-too-long'), now: 10_000},
  );
  const repository = new InMemoryCareEventRepository([active]);
  const endSleep = createEndSleepSession({
    repository,
    clock: {now: () => startedAt + MAX_SLEEP_DURATION_MS + 1},
    analytics: {track: async () => undefined},
  });

  const ended = await endSleep({groupId: active.groupId, eventId: active.id});
  assert.equal(ended.endedAt, startedAt + MAX_SLEEP_DURATION_MS);
  assert.equal(ended.updatedAt, startedAt + MAX_SLEEP_DURATION_MS + 1);
});

it('refuses to end sleep when the system clock moved behind the last update', async () => {
  const active = createCareEvent(
    {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      caregiverId: userId('caregiver-1'),
      kind: 'sleep',
      sleepType: 'nap',
      startedAt: 10_000,
    },
    {id: eventId('sleep-clock-rollback'), now: 20_000},
  );
  const repository = new InMemoryCareEventRepository([active]);
  const endSleep = createEndSleepSession({
    repository,
    clock: {now: () => 15_000},
    analytics: {track: async () => undefined},
  });

  await assert.rejects(
    endSleep({groupId: active.groupId, eventId: active.id}),
    /clock moved/,
  );
  assert.equal((await repository.findById(active.groupId, active.id))?.revision, 1);
});
