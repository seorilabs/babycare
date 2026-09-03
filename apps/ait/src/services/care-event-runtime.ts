import { Storage } from '@apps-in-toss/framework';
import {
  createEndSleepSession,
  createRecordCareEvent,
  createSoftDeleteCareEvent,
  createUpdateCareEvent,
  eventId,
  type CareEvent,
  type CreateCareEventInput,
} from '../../../../packages/product-core/src/index.ts';
import {
  CareEventOverviewFeed,
  CareEventTimelineFeed,
  LocalFirstCareEventRepository,
  PersistentCareEventSyncStore,
  type CareEventOverviewFeedState,
  type CareEventTimelineFeedState,
  type CareEventSyncState,
} from '../../../../packages/product-data/src/index.ts';

import { babycareAnalytics } from './analytics';
import { AitFirestoreCareEventRemoteStore, type ReadyCareSession } from './babycare-backend';

export interface AitCareEventRuntime {
  readonly observeTimeline: (listener: (state: CareEventTimelineFeedState) => void) => () => void;
  readonly loadMoreTimeline: () => Promise<void>;
  readonly retryLoadMoreTimeline: () => Promise<void>;
  readonly observeOverview: (listener: (state: CareEventOverviewFeedState) => void) => () => void;
  readonly observeSyncState: (listener: (states: readonly CareEventSyncState[]) => void) => () => void;
  readonly record: (input: CreateCareEventInput) => Promise<CareEvent>;
  readonly update: (event: CareEvent, input: CreateCareEventInput) => Promise<CareEvent>;
  readonly endSleep: (event: CareEvent) => Promise<CareEvent>;
  readonly softDelete: (event: CareEvent) => Promise<CareEvent>;
  readonly syncNow: () => Promise<void>;
  readonly reapplyConflicts: () => Promise<void>;
  readonly discardConflicts: () => Promise<void>;
  readonly purge: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function nextEventId() {
  return eventId(`event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
}

/**
 * Composes the same local-first event repository used by Android/iOS with
 * AppsInToss Storage and the Firestore REST transport.
 */
export async function createAitCareEventRuntime(
  ready: ReadyCareSession,
  onRemoteError: (error: Error) => void
): Promise<AitCareEventRuntime> {
  const local = new PersistentCareEventSyncStore(
    {
      userId: ready.membership.userId,
      groupId: ready.group.id,
      babyId: ready.baby.id,
    },
    Storage
  );
  await local.mergeRemoteEvents(ready.events);
  const remote = new AitFirestoreCareEventRemoteStore(ready.uid);
  const repository = new LocalFirstCareEventRepository(local, remote, {
    onRemoteError: (error) => {
      const cause = error.cause;
      onRemoteError(cause instanceof Error ? cause : new Error('공동 기록을 동기화하지 못했어요.'));
    },
    remoteObservationMode: 'external_pages',
  });
  const record = createRecordCareEvent({
    repository,
    clock: { now: () => Date.now() },
    idGenerator: { nextEventId },
    analytics: babycareAnalytics,
    firstLogStorage: Storage,
    groupRole: ready.membership.membershipRole,
  });
  const update = createUpdateCareEvent({
    repository,
    clock: {now: () => Date.now()},
    analytics: babycareAnalytics,
  });
  const endSleep = createEndSleepSession({
    repository,
    clock: { now: () => Date.now() },
    analytics: babycareAnalytics,
  });
  const softDelete = createSoftDeleteCareEvent({
    repository,
    clock: { now: () => Date.now() },
    analytics: babycareAnalytics,
  });
  const timelineFeed = new CareEventTimelineFeed(local, remote, {
    groupId: ready.group.id,
    babyId: ready.baby.id,
    pageSize: 20,
    maxCachedEvents: 200,
    maxScanPagesPerLoad: 3,
    onRemoteError: (error) => {
      const cause = error.cause;
      onRemoteError(cause instanceof Error ? cause : new Error('이전 기록을 불러오지 못했어요.'));
    },
    onServerConfirmed: () => repository.retryFailures(['retryable', 'unauthenticated']),
  });
  const overviewFeed = new CareEventOverviewFeed(local, remote, {
    groupId: ready.group.id,
    babyId: ready.baby.id,
    clock: { now: () => Date.now() },
    onRemoteError: (error) => {
      const cause = error.cause;
      onRemoteError(cause instanceof Error ? cause : new Error('돌봄 요약을 불러오지 못했어요.'));
    },
    onServerConfirmed: () => repository.retryFailures(['retryable', 'unauthenticated']),
  });
  const stopTimelineOwner = timelineFeed.start(() => undefined);
  const stopOverviewOwner = overviewFeed.start(() => undefined);

  return {
    observeTimeline: (listener) => timelineFeed.start(listener),
    loadMoreTimeline: () => timelineFeed.loadMore(),
    retryLoadMoreTimeline: () => timelineFeed.retryLoadMore(),
    observeOverview: (listener) => overviewFeed.start(listener),
    observeSyncState: (listener) => repository.observeSyncState(listener),
    record,
    update: (event, input) =>
      update({
        groupId: ready.group.id,
        eventId: event.id,
        requestedBy: ready.membership.userId,
        update: input,
      }),
    endSleep: (event) => endSleep({ groupId: ready.group.id, eventId: event.id }),
    softDelete: (event) =>
      softDelete({
        groupId: ready.group.id,
        eventId: event.id,
        requestedBy: ready.membership.userId,
      }),
    syncNow: () => repository.syncNow({ retryFailed: true }),
    reapplyConflicts: () => repository.reapplyConflicts(),
    discardConflicts: () => repository.discardConflicts(),
    purge: () => repository.clear(),
    close: async () => {
      stopTimelineOwner();
      stopOverviewOwner();
      timelineFeed.close();
      overviewFeed.close();
      await repository.close();
    },
  };
}
