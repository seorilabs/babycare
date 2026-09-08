import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  compareCareEventNewestFirst,
  type CareEvent,
} from '@babycare/product-core';

export const LOCAL_TIMELINE_PAGE_SIZE = 20;
export const LOCAL_TIMELINE_MAX_EVENTS = 200;

export interface LocalTimelinePaginationState {
  readonly events: readonly CareEvent[];
  readonly hasMore: boolean;
  readonly capped: boolean;
  readonly loadingMore: boolean;
  readonly loadMoreError: boolean;
  loadMore(): Promise<void>;
  retryLoadMore(): Promise<void>;
}

/**
 * Presentation-only pagination for the AsyncStorage preview composition.
 * Home/Stats still receive the complete local event array. The authenticated
 * cloud composition uses `CareEventTimelineFeed` instead. Local paging only
 * slices an in-memory array, so it cannot produce a load error; the remote
 * feed owns loadMoreError/retry transitions.
 */
export function useLocalTimelinePagination(
  events: readonly CareEvent[],
  scopeKey: string,
): LocalTimelinePaginationState {
  const [page, setPage] = useState({
    scopeKey,
    limit: LOCAL_TIMELINE_PAGE_SIZE,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const effectiveLimit =
    page.scopeKey === scopeKey ? page.limit : LOCAL_TIMELINE_PAGE_SIZE;
  const boundedLimit = Math.min(effectiveLimit, LOCAL_TIMELINE_MAX_EVENTS);
  const orderedEvents = useMemo(
    () => [...events].sort(compareCareEventNewestFirst),
    [events],
  );
  const visibleEvents = useMemo(
    () => orderedEvents.slice(0, boundedLimit),
    [boundedLimit, orderedEvents],
  );
  const capped =
    events.length > LOCAL_TIMELINE_MAX_EVENTS &&
    boundedLimit >= LOCAL_TIMELINE_MAX_EVENTS;
  const hasMore = events.length > boundedLimit && !capped;

  useEffect(() => {
    inFlight.current = undefined;
    setLoadingMore(false);
    setPage({scopeKey, limit: LOCAL_TIMELINE_PAGE_SIZE});
  }, [scopeKey]);

  const loadMore = useCallback((): Promise<void> => {
    if (inFlight.current) {
      return inFlight.current;
    }
    if (!hasMore) {
      return Promise.resolve();
    }
    setLoadingMore(true);
    const operation = Promise.resolve()
      .then(() => {
        setPage(current => ({
          scopeKey,
          limit: Math.min(
            current.scopeKey === scopeKey
              ? current.limit + LOCAL_TIMELINE_PAGE_SIZE
              : LOCAL_TIMELINE_PAGE_SIZE,
            LOCAL_TIMELINE_MAX_EVENTS,
          ),
        }));
      })
      .finally(() => {
        inFlight.current = undefined;
        setLoadingMore(false);
      });
    inFlight.current = operation;
    return operation;
  }, [hasMore, scopeKey]);

  return {
    events: visibleEvents,
    hasMore,
    capped,
    loadingMore,
    loadMoreError: false,
    loadMore,
    retryLoadMore: loadMore,
  };
}
