import {
  createEndSleepSession,
  createRecordCareEvent,
  createSoftDeleteCareEvent,
  createUpdateCareEvent,
  type AnalyticsPort,
  type AuthPort,
  type CareGroupRepositoryPort,
  type CareEventProjectionRemotePort,
  type CareEventRemoteStorePort,
  type ClockPort,
  type IdGeneratorPort,
} from '@babycare/product-core';
import {
  CareEventOverviewFeed,
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
  readonly remote: CareEventRemoteStorePort & CareEventProjectionRemotePort;
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
  let overviewFeed: CareEventOverviewFeed | undefined;
  let stopTimelineOwner: () => void = () => undefined;
  let stopOverviewOwner: () => void = () => undefined;
  const repository = new LocalFirstCareEventRepository(
    local,
    dependencies.remote,
    {
      onRemoteError: error => lifecycle.handleRemoteError(error),
      remoteObservationMode: 'external_pages',
    },
  );
  const closeProjectionFeeds = () => {
    stopTimelineOwner();
    stopTimelineOwner = () => undefined;
    stopOverviewOwner();
    stopOverviewOwner = () => undefined;
    timelineFeed?.close();
    overviewFeed?.close();
  };
  const purge = async () => {
    closeProjectionFeeds();
    await repository.clear();
  };
  const refreshProjectionFeeds = async () => {
    const [timelineResult] = await Promise.allSettled([
      timelineFeed?.refresh() ?? Promise.resolve(),
      overviewFeed?.refresh() ?? Promise.resolve(),
    ]);
    // Overview refresh reports its typed error through onRemoteError before
    // rejecting. Timeline refresh does not, so only its rejection is rethrown
    // to the lifecycle to avoid reporting the overview failure twice.
    if (timelineResult.status === 'rejected') {
      throw timelineResult.reason;
    }
  };
  lifecycle = new CareSessionLifecycle({
    auth: dependencies.auth,
    groups: dependencies.groups,
    context: dependencies.context,
    purge,
    onAuthenticationRestored: async () => {
      await repository.retryFailures(['unauthenticated']);
      await refreshProjectionFeeds();
    },
    onMembershipRestored: async () => {
      await refreshProjectionFeeds();
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
    overviewFeed = new CareEventOverviewFeed(local, dependencies.remote, {
      groupId: dependencies.context.group.id,
      babyId: dependencies.context.baby.id,
      clock: dependencies.clock,
      onRemoteError: error => lifecycle.handleRemoteError(error),
      onServerConfirmed: () =>
        repository.retryFailures(['retryable', 'unauthenticated']),
    });
    // Exactly one owner per projection is started for this authenticated
    // scope. UI callers add listeners to these instances instead of creating
    // competing Firestore feeds.
    stopTimelineOwner = timelineFeed.start(() => undefined);
    stopOverviewOwner = overviewFeed.start(() => undefined);
  } catch (error) {
    stopSessionLifecycle?.();
    closeProjectionFeeds();
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
  const activeOverviewFeed = overviewFeed;
  if (!activeTimelineFeed || !activeOverviewFeed) {
    throw new Error('Care event projection owners failed to initialize');
  }
  const stopContainerSession = () => {
    stopSessionLifecycle();
    closeProjectionFeeds();
  };
  return {
    repository,
    timelineFeed: activeTimelineFeed,
    overviewFeed: activeOverviewFeed,
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
      firstLogStorage: AsyncStorage,
      groupRole: dependencies.context.membership.membershipRole,
    }),
    updateCareEvent: createUpdateCareEvent({
      repository,
      clock: dependencies.clock,
      analytics: dependencies.analytics,
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
