import {Storage} from '@apps-in-toss/framework';
import {
  createEndSleepSession,
  createRecordCareEvent,
  createSoftDeleteCareEvent,
  eventId,
  type CareEvent,
  type CareEventQuery,
  type CreateCareEventInput,
} from '../../../../packages/product-core/src/index.ts';
import {
  LocalFirstCareEventRepository,
  PersistentCareEventSyncStore,
  type CareEventSyncState,
} from '../../../../packages/product-data/src/index.ts';

import {babycareAnalytics} from './analytics';
import {
  AitFirestoreCareEventRemoteStore,
  type ReadyCareSession,
} from './babycare-backend';

export interface AitCareEventRuntime {
  readonly observe: (
    listener: (events: readonly CareEvent[]) => void,
  ) => () => void;
  readonly observeSyncState: (
    listener: (states: readonly CareEventSyncState[]) => void,
  ) => () => void;
  readonly record: (input: CreateCareEventInput) => Promise<CareEvent>;
  readonly endSleep: (event: CareEvent) => Promise<CareEvent>;
  readonly softDelete: (event: CareEvent) => Promise<CareEvent>;
  readonly syncNow: () => Promise<void>;
  readonly purge: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function nextEventId() {
  return eventId(
    `event-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 12)}`,
  );
}

/**
 * Composes the same local-first event repository used by Android/iOS with
 * AppsInToss Storage and the Firestore REST transport.
 */
export async function createAitCareEventRuntime(
  ready: ReadyCareSession,
  onRemoteError: (error: Error) => void,
): Promise<AitCareEventRuntime> {
  const local = new PersistentCareEventSyncStore(
    {
      userId: ready.membership.userId,
      groupId: ready.group.id,
      babyId: ready.baby.id,
    },
    Storage,
  );
  await local.mergeRemoteEvents(ready.events);
  const remote = new AitFirestoreCareEventRemoteStore(ready.uid);
  const repository = new LocalFirstCareEventRepository(local, remote, {
    onRemoteError: error => {
      const cause = error.cause;
      onRemoteError(
        cause instanceof Error
          ? cause
          : new Error('공동 기록을 동기화하지 못했어요.'),
      );
    },
  });
  const query: CareEventQuery = {
    groupId: ready.group.id,
    babyId: ready.baby.id,
  };
  const record = createRecordCareEvent({
    repository,
    clock: {now: () => Date.now()},
    idGenerator: {nextEventId},
    analytics: babycareAnalytics,
  });
  const endSleep = createEndSleepSession({
    repository,
    clock: {now: () => Date.now()},
    analytics: babycareAnalytics,
  });
  const softDelete = createSoftDeleteCareEvent({
    repository,
    clock: {now: () => Date.now()},
    analytics: babycareAnalytics,
  });

  return {
    observe: listener => repository.observe(query, listener),
    observeSyncState: listener => repository.observeSyncState(listener),
    record,
    endSleep: event =>
      endSleep({groupId: ready.group.id, eventId: event.id}),
    softDelete: event =>
      softDelete({
        groupId: ready.group.id,
        eventId: event.id,
        requestedBy: ready.membership.userId,
      }),
    syncNow: () => repository.syncNow({retryFailed: true}),
    purge: () => repository.clear(),
    close: () => repository.close(),
  };
}
