import React, {useEffect} from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
} from '@babycare/product-core';

import {
  LOCAL_TIMELINE_MAX_EVENTS,
  LOCAL_TIMELINE_PAGE_SIZE,
  useLocalTimelinePagination,
  type LocalTimelinePaginationState,
} from '../src/app/use-local-timeline-pagination';

function events(count: number): readonly CareEvent[] {
  return Array.from({length: count}, (_, index) => {
    const occurredAt = count - index;
    return createCareEvent(
      {
        groupId: groupId('local-timeline-group'),
        babyId: babyId('local-timeline-baby'),
        caregiverId: userId('local-timeline-user'),
        kind: 'diaper',
        diaperType: 'wet',
        occurredAt,
      },
      {id: eventId(`local-event-${occurredAt}`), now: count + 1},
    );
  });
}

function Harness(props: {
  readonly events: readonly CareEvent[];
  readonly scopeKey: string;
  readonly onState: (state: LocalTimelinePaginationState) => void;
}) {
  const state = useLocalTimelinePagination(props.events, props.scopeKey);
  useEffect(() => props.onState(state), [props, state]);
  return null;
}

describe('useLocalTimelinePagination', () => {
  it('expands one page at a time and deduplicates concurrent load requests', async () => {
    const allEvents = events(45);
    let latest!: LocalTimelinePaginationState;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <Harness
          events={allEvents}
          onState={state => {
            latest = state;
          }}
          scopeKey="scope-a"
        />,
      );
    });

    expect(latest.events).toHaveLength(LOCAL_TIMELINE_PAGE_SIZE);
    expect(latest.hasMore).toBe(true);
    expect(latest.loadingMore).toBe(false);
    expect(latest.loadMoreError).toBeUndefined();
    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    await ReactTestRenderer.act(async () => {
      first = latest.loadMore();
      duplicate = latest.loadMore();
      expect(duplicate).toBe(first);
      await first;
    });

    expect(latest.events).toHaveLength(40);
    expect(latest.hasMore).toBe(true);
    await ReactTestRenderer.act(async () => latest.retryLoadMore());
    expect(latest.events).toHaveLength(45);
    expect(latest.hasMore).toBe(false);
    expect(latest.loadingMore).toBe(false);
    expect(latest.loadMoreError).toBeUndefined();
    expect(allEvents).toHaveLength(45);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  it('caps presentation rows and resets the page when the local scope changes', async () => {
    const allEvents = events(LOCAL_TIMELINE_MAX_EVENTS + 5);
    let latest!: LocalTimelinePaginationState;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    const onState = (state: LocalTimelinePaginationState) => {
      latest = state;
    };
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <Harness events={allEvents} onState={onState} scopeKey="scope-a" />,
      );
    });

    while (latest.hasMore) {
      await ReactTestRenderer.act(async () => latest.loadMore());
    }
    expect(latest.events).toHaveLength(LOCAL_TIMELINE_MAX_EVENTS);
    expect(latest.capped).toBe(true);

    await ReactTestRenderer.act(async () => {
      renderer.update(
        <Harness events={allEvents} onState={onState} scopeKey="scope-b" />,
      );
    });
    expect(latest.events).toHaveLength(LOCAL_TIMELINE_PAGE_SIZE);
    expect(latest.capped).toBe(false);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
