import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  babyId,
  careEventCursorFromEvent,
  compareCareEventNewestFirst,
  createCareEvent,
  eventId,
  groupId,
  isCareEventAfterCursor,
  paginateCareEvents,
  userId,
  validateCareEventPageRequest,
  type CareEvent,
  type CareEventPageRequest,
  type EventId,
} from '../src/index.ts';

const group = groupId('group-1');
const baby = babyId('baby-1');
const caregiver = userId('user-1');

function diaper(id: string, occurredAt: number): CareEvent {
  return createCareEvent(
    {
      groupId: group,
      babyId: baby,
      caregiverId: caregiver,
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt,
    },
    { id: eventId(id), now: occurredAt + 1 },
  );
}

function request(
  overrides: Partial<CareEventPageRequest> = {},
): CareEventPageRequest {
  return { groupId: group, babyId: baby, pageSize: 2, ...overrides };
}

describe('care event timeline ordering', () => {
  it('uses deterministic descending UTF-8 document IDs for equal timestamps', () => {
    const events = [
      diaper('event-z', 1_000),
      diaper('event-ä', 1_000),
      diaper('event-🌙', 1_000),
      diaper('event-newer', 2_000),
    ].sort(compareCareEventNewestFirst);

    assert.deepEqual(
      events.map((event) => event.id),
      ['event-newer', 'event-🌙', 'event-ä', 'event-z'],
    );
  });

  it('uses an exclusive cursor boundary without gaps or duplicates', () => {
    const events = [
      diaper('event-a', 2_000),
      diaper('event-c', 2_000),
      diaper('event-b', 2_000),
      diaper('event-old', 1_000),
    ];
    const first = paginateCareEvents(events, request());

    assert.deepEqual(
      first.events.map((event) => event.id),
      ['event-c', 'event-b'],
    );
    assert.equal(first.hasMore, true);
    assert.deepEqual(first.nextCursor, {
      occurredAt: 2_000,
      eventId: eventId('event-b'),
    });

    const second = paginateCareEvents(
      events,
      request({ after: first.nextCursor }),
    );
    assert.deepEqual(
      second.events.map((event) => event.id),
      ['event-a', 'event-old'],
    );
    assert.equal(second.hasMore, false);
    assert.equal(second.nextCursor, undefined);
    assert.equal(
      isCareEventAfterCursor(events[0]!, careEventCursorFromEvent(events[2]!)),
      true,
    );
  });
});

describe('care event page request validation', () => {
  it('rejects unbounded or fractional page sizes', () => {
    for (const pageSize of [0, 101, 1.5, Number.NaN]) {
      assert.throws(
        () => validateCareEventPageRequest(request({ pageSize })),
        /pageSize/,
      );
    }
  });

  it('rejects invalid cursor timestamps and document IDs', () => {
    for (const occurredAt of [-1, 1.5, Number.NaN]) {
      assert.throws(
        () =>
          validateCareEventPageRequest(
            request({ after: { occurredAt, eventId: eventId('event-1') } }),
          ),
        /cursor timestamp/,
      );
    }
    assert.throws(
      () =>
        validateCareEventPageRequest(
          request({
            after: {
              occurredAt: 1_000,
              eventId: '../event' as EventId,
            },
          }),
        ),
      /cursor eventId/,
    );
  });

  it('rejects invalid ranges and accepts exact page-size boundaries', () => {
    assert.throws(
      () => validateCareEventPageRequest(request({ from: 2_000, to: 2_000 })),
      /positive duration/,
    );
    assert.equal(
      validateCareEventPageRequest(request({ pageSize: 1 })).pageSize,
      1,
    );
    assert.equal(
      validateCareEventPageRequest(request({ pageSize: 100 })).pageSize,
      100,
    );
  });
});
