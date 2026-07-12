import {
  createEndSleepSession,
  createRecordCareEvent,
  createSoftDeleteCareEvent,
  isActiveSleep,
  type AnalyticsPort,
  type CareEvent,
  type CareEventQuery,
  type SleepEvent,
} from '@babycare/product-core';

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
    return repository.observe(query, events =>
      listener({events, activeSleep: events.find(isActiveSleep)}),
    );
  },
  recordCareEvent: createRecordCareEvent({
    repository,
    clock,
    analytics,
    idGenerator: new NativeIdGenerator(),
  }),
  endSleepSession: createEndSleepSession({repository, clock, analytics}),
  softDeleteCareEvent: createSoftDeleteCareEvent({repository, clock, analytics}),
};
