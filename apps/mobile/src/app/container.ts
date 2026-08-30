import {
  createEndSleepSession,
  createRecordCareEvent,
  createSoftDeleteCareEvent,
  createUpdateCareEvent,
  isActiveSleep,
  type AnalyticsPort,
  type CareEvent,
  type CareEventQuery,
  type SleepEvent,
} from '@babycare/product-core';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {PersistentCareEventRepository} from '../adapters/local/persistent-care-event-repository';
import {LocalSessionRepository} from '../adapters/local/local-session-repository';
import {NativeIdGenerator} from '../adapters/system/native-id-generator';

const repository = new PersistentCareEventRepository();
const clock = {now: () => Date.now()};
const analytics: AnalyticsPort = {
  async track() {
    // Firebase Analytics adapter is wired only after the dev Firebase app is registered.
  },
};

export interface CareEventOverviewSnapshot {
  readonly events: readonly CareEvent[];
  readonly activeSleep: SleepEvent | undefined;
}

/**
 * Hides only snapshots that still contain a locally deleted row. Once an ID
 * disappears from the complete source, its temporary stale-snapshot marker is
 * removed so a later, different active singleton is never suppressed.
 */
export function selectVisibleCareEventOverview(
  snapshot: CareEventOverviewSnapshot,
  pendingDeletedEventIds: Set<string>,
): CareEventOverviewSnapshot {
  const visibleEvents = snapshot.events.filter(
    event => !pendingDeletedEventIds.has(event.id),
  );
  const activeSleep =
    snapshot.activeSleep && !pendingDeletedEventIds.has(snapshot.activeSleep.id)
      ? snapshot.activeSleep
      : undefined;
  const observedIds = new Set<string>(
    snapshot.events.map(event => event.id),
  );
  if (snapshot.activeSleep) {
    observedIds.add(snapshot.activeSleep.id);
  }
  for (const id of pendingDeletedEventIds) {
    if (!observedIds.has(id)) {
      pendingDeletedEventIds.delete(id);
    }
  }
  return {events: visibleEvents, activeSleep};
}

export const appContainer = {
  repository,
  sessionRepository: new LocalSessionRepository(),
  /**
   * Complete-snapshot source for the Firebase-free local preview only.
   * Authenticated composition supplies the same shape from overviewFeed.start,
   * where active sleep comes from the independent singleton projection.
   */
  observeOverview(
    query: CareEventQuery,
    listener: (snapshot: CareEventOverviewSnapshot) => void,
  ) {
    let active = true;
    const stop = repository.observe(query, events => {
      if (active) {
        listener({events, activeSleep: events.find(isActiveSleep)});
      }
    });
    return () => {
      if (!active) {
        return;
      }
      active = false;
      stop();
    };
  },
  recordCareEvent: createRecordCareEvent({
    repository,
    clock,
    analytics,
    idGenerator: new NativeIdGenerator(),
    firstLogStorage: AsyncStorage,
    groupRole: 'owner',
  }),
  updateCareEvent: createUpdateCareEvent({repository, clock, analytics}),
  endSleepSession: createEndSleepSession({repository, clock, analytics}),
  softDeleteCareEvent: createSoftDeleteCareEvent({repository, clock, analytics}),
};
