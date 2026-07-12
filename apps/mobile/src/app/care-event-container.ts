import {
  createEndSleepSession,
  createRecordCareEvent,
  createSoftDeleteCareEvent,
  type AnalyticsPort,
  type AuthPort,
  type CareGroupRepositoryPort,
  type CareEventRemoteStorePort,
  type ClockPort,
  type IdGeneratorPort,
} from '@babycare/product-core';
import {
  CareEventTimelineFeed,
  LocalFirstCareEventRepository,
  PersistentCareEventSyncStore,
  type CareEventTimelineFeedConfig,
} from '@babycare/product-data';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  assertAuthenticatedCareContext,
  type AuthenticatedCareContext,
} from './care-context';
import {
  CareSessionLifecycle,
  type CareSessionRevocationReason,
} from './care-session-lifecycle';

export interface CareEventContainerDependencies {
  readonly context: AuthenticatedCareContext;
  readonly auth: AuthPort;
  readonly groups: Pick<
    CareGroupRepositoryPort,
    'observeMembership' | 'listForUser'
  >;
  readonly remote: CareEventRemoteStorePort;
  readonly timeline: CareEventTimelineFeedConfig;
  readonly clock: ClockPort;
  readonly idGenerator: IdGeneratorPort;
  readonly analytics: AnalyticsPort;
  readonly onRevoked: (reason: CareSessionRevocationReason) => void;
  readonly onError: (error: Error) => void;
}

/**
 * Builds the cloud-sync event slice only after Auth and membership resolution.
 * The local preview session is intentionally not accepted by this factory.
 */
export async function createCareEventContainer(
  dependencies: CareEventContainerDependencies,
) {
  assertAuthenticatedCareContext(dependencies.context);
  const local = new PersistentCareEventSyncStore(
    {
      userId: dependencies.context.identity.userId,
      groupId: dependencies.context.group.id,
      babyId: dependencies.context.baby.id,
    },
    AsyncStorage,
  );
  let lifecycle: CareSessionLifecycle;
  let timelineFeed: CareEventTimelineFeed | undefined;
  const repository = new LocalFirstCareEventRepository(
    local,
    dependencies.remote,
    {
      onRemoteError: error => lifecycle.handleRemoteError(error),
      remoteObservationMode: 'external_pages',
    },
  );
  const closeTimelineFeed = () => {
    timelineFeed?.close();
  };
  const purge = async () => {
    closeTimelineFeed();
    await repository.clear();
  };
  lifecycle = new CareSessionLifecycle({
    auth: dependencies.auth,
    groups: dependencies.groups,
    context: dependencies.context,
    purge,
    onAuthenticationRestored: async () => {
      await repository.retryFailures(['unauthenticated']);
      await timelineFeed?.refresh();
    },
    onMembershipRestored: async () => {
      await timelineFeed?.refresh();
    },
    onRevoked: dependencies.onRevoked,
    onError: dependencies.onError,
  });
  let stopSessionLifecycle: () => void = () => undefined;
  try {
    stopSessionLifecycle = lifecycle.start();
    timelineFeed = new CareEventTimelineFeed(local, dependencies.remote, {
      ...dependencies.timeline,
      groupId: dependencies.context.group.id,
      babyId: dependencies.context.baby.id,
      onRemoteError: error => lifecycle.handleRemoteError(error),
      onServerConfirmed: () =>
        repository.retryFailures(['retryable', 'unauthenticated']),
    });
    // Exactly one page owner is started per authenticated scope. UI callers
    // add presentation listeners to this instance instead of creating feeds.
    timelineFeed.start(() => undefined);
  } catch (error) {
    stopSessionLifecycle?.();
    closeTimelineFeed();
    try {
      await repository.clear();
    } catch (cleanupError) {
      dependencies.onError(
        cleanupError instanceof Error
          ? cleanupError
          : new Error('Care event container cleanup failed'),
      );
    }
    throw error;
  }
  const activeTimelineFeed = timelineFeed;
  if (!activeTimelineFeed) {
    throw new Error('Care event timeline owner failed to initialize');
  }
  const stopContainerSession = () => {
    stopSessionLifecycle();
    closeTimelineFeed();
  };
  return {
    repository,
    timelineFeed: activeTimelineFeed,
    syncNow: repository.syncNow.bind(repository),
    observeSyncState: repository.observeSyncState.bind(repository),
    purge,
    dispose: async () => {
      stopContainerSession();
      let quiesceError: Error | undefined;
      try {
        repository.quiesce();
      } catch (error) {
        quiesceError =
          error instanceof Error
            ? error
            : new Error('Care event observer cleanup failed');
      }
      try {
        await lifecycle.whenSettled();
      } finally {
        await repository.close();
      }
      if (quiesceError) {
        dependencies.onError(quiesceError);
      }
    },
    stopSessionLifecycle: stopContainerSession,
    whenSessionSettled: lifecycle.whenSettled.bind(lifecycle),
    recordCareEvent: createRecordCareEvent({
      repository,
      clock: dependencies.clock,
      analytics: dependencies.analytics,
      idGenerator: dependencies.idGenerator,
    }),
    endSleepSession: createEndSleepSession({
      repository,
      clock: dependencies.clock,
      analytics: dependencies.analytics,
    }),
    softDeleteCareEvent: createSoftDeleteCareEvent({
      repository,
      clock: dependencies.clock,
      analytics: dependencies.analytics,
    }),
  };
}
