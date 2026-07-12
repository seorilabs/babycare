import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  babyId,
  buildDashboardSummary,
  createCareEvent,
  eventId,
  groupId,
  MAX_SLEEP_DURATION_MS,
  userId,
} from '../src/index.ts';

const group = groupId('group-1');
const baby = babyId('baby-1');
const caregiver = userId('user-1');
const base = { groupId: group, babyId: baby, caregiverId: caregiver };

describe('buildDashboardSummary', () => {
  it('returns latest cards and today totals while ignoring soft-deleted records', () => {
    const events = [
      createCareEvent(
        {
          ...base,
          kind: 'feeding',
          feedingType: 'formula',
          volumeMl: 120,
          occurredAt: 2_000,
        },
        { id: eventId('feed-1'), now: 2_100 },
      ),
      createCareEvent(
        {
          ...base,
          kind: 'diaper',
          diaperType: 'dirty',
          occurredAt: 3_000,
        },
        { id: eventId('diaper-1'), now: 3_100 },
      ),
      createCareEvent(
        {
          ...base,
          kind: 'sleep',
          sleepType: 'nap',
          startedAt: 4_000,
          endedAt: 64_000,
        },
        { id: eventId('sleep-1'), now: 64_001 },
      ),
    ];
    const deleted = { ...events[0]!, deletedAt: 70_000 };
    const summary = buildDashboardSummary([deleted, ...events.slice(1)], { from: 0, to: 100_000 }, 80_000);

    assert.equal(summary.latest.feeding, undefined);
    assert.equal(summary.latest.diaper?.id, eventId('diaper-1'));
    assert.equal(summary.feedingCount, 0);
    assert.equal(summary.diaperCount, 1);
    assert.equal(summary.sleepCount, 1);
    assert.equal(summary.sleepDurationSeconds, 60);
  });

  it('clips an active sleep session at now', () => {
    const sleep = createCareEvent(
      {
        ...base,
        kind: 'sleep',
        sleepType: 'night',
        startedAt: 10_000,
      },
      { id: eventId('active-sleep'), now: 10_000 },
    );
    const summary = buildDashboardSummary([sleep], { from: 0, to: 100_000 }, 40_000);

    assert.equal(summary.sleepDurationSeconds, 30);
  });

  it('caps a stale active sleep session at the domain maximum', () => {
    const startedAt = 10_000;
    const sleep = createCareEvent(
      {
        ...base,
        kind: 'sleep',
        sleepType: 'night',
        startedAt,
      },
      {id: eventId('stale-active-sleep'), now: startedAt},
    );
    const now = startedAt + MAX_SLEEP_DURATION_MS + 24 * 60 * 60 * 1_000;

    const summary = buildDashboardSummary(
      [sleep],
      {from: startedAt, to: now},
      now,
    );

    assert.equal(
      summary.sleepDurationSeconds,
      MAX_SLEEP_DURATION_MS / 1_000,
    );
  });

  it('uses the canonical document ID tie-break for equally timed latest events', () => {
    const first = createCareEvent(
      {
        ...base,
        kind: 'feeding',
        feedingType: 'formula',
        volumeMl: 90,
        occurredAt: 10_000,
      },
      {id: eventId('feed-a'), now: 10_000},
    );
    const second = createCareEvent(
      {
        ...base,
        kind: 'feeding',
        feedingType: 'formula',
        volumeMl: 100,
        occurredAt: 10_000,
      },
      {id: eventId('feed-b'), now: 10_000},
    );

    const summary = buildDashboardSummary(
      [first, second],
      {from: 0, to: 20_000},
      20_000,
    );

    assert.equal(summary.latest.feeding?.id, eventId('feed-b'));
  });

  it('attributes the overlapping part of a prior sleep to the range', () => {
    const sleep = createCareEvent(
      {
        ...base,
        kind: 'sleep',
        sleepType: 'night',
        startedAt: 1_000,
        endedAt: 21_000,
      },
      {id: eventId('cross-boundary-sleep'), now: 21_000},
    );
    const summary = buildDashboardSummary(
      [sleep],
      {from: 11_000, to: 31_000},
      31_000,
    );

    assert.equal(summary.sleepCount, 0);
    assert.equal(summary.sleepDurationSeconds, 10);
  });
});
