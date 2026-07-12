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
  LocalFirstCareEventRepository,
  PersistentCareEventSyncStore,
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
  const repository = new LocalFirstCareEventRepository(
    local,
    dependencies.remote,
    {
      onRemoteError: error => lifecycle.handleRemoteError(error),
    },
  );
  lifecycle = new CareSessionLifecycle({
    auth: dependencies.auth,
    groups: dependencies.groups,
    context: dependencies.context,
    purge: repository.clear.bind(repository),
    onAuthenticationRestored: () =>
      repository.retryFailures(['unauthenticated']),
    onRevoked: dependencies.onRevoked,
    onError: dependencies.onError,
  });
  let stopSessionLifecycle: () => void;
  try {
    stopSessionLifecycle = lifecycle.start();
  } catch (error) {
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
  return {
    repository,
    syncNow: repository.syncNow.bind(repository),
    observeSyncState: repository.observeSyncState.bind(repository),
    purge: repository.clear.bind(repository),
    dispose: async () => {
      stopSessionLifecycle();
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
    stopSessionLifecycle,
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
