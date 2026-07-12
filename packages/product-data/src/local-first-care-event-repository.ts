import type {
  CareEvent,
  CareEventQuery,
  CareEventRemoteError,
  CareEventRemoteStorePort,
  CareEventRepositoryPort,
  EventId,
  GroupId,
} from '@babycare/product-core';

import type {
  CareEventSyncFailureKind,
  CareEventSyncLocalStorePort,
  CareEventSyncState,
} from './persistent-care-event-sync-store.ts';

export interface LocalFirstCareEventRepositoryOptions {
  readonly onRemoteError?: (error: CareEventRemoteError) => void;
}

function thrownRemoteError(error: unknown): CareEventRemoteError {
  if (
    error &&
    typeof error === 'object' &&
    'remoteError' in error &&
    error.remoteError &&
    typeof error.remoteError === 'object' &&
    'code' in error.remoteError
  ) {
    return error.remoteError as CareEventRemoteError;
  }
  return {code: 'retryable', cause: error};
}

function failureKind(error: CareEventRemoteError): CareEventSyncFailureKind {
  return error.code;
}

/**
 * UI-facing repository that commits locally and atomically queues a remote
 * mutation before returning. Remote transactions drain in the background in
 * revision order and never become the UI save completion signal.
 */
export class LocalFirstCareEventRepository
  implements CareEventRepositoryPort
{
  readonly #local: CareEventSyncLocalStorePort;
  readonly #remote: CareEventRemoteStorePort;
  readonly #onRemoteError: (error: CareEventRemoteError) => void;
  readonly #observationStops = new Set<() => void>();
  #flushTail: Promise<void> = Promise.resolve();
  #clearPromise: Promise<void> | undefined;
  #closePromise: Promise<void> | undefined;
  #generation = 0;
  #disposed = false;

  constructor(
    local: CareEventSyncLocalStorePort,
    remote: CareEventRemoteStorePort,
    options: LocalFirstCareEventRepositoryOptions = {},
  ) {
    this.#local = local;
    this.#remote = remote;
    this.#onRemoteError = options.onRemoteError ?? (() => undefined);
  }

  async save(event: CareEvent): Promise<void> {
    const generation = this.#activeGeneration();
    await this.#local.saveAndEnqueue(event);
    if (!this.#isActive(generation)) {
      return;
    }
    this.#requestFlush().catch(error =>
      this.#onRemoteError({code: 'invalid', cause: error}),
    );
  }

  findById(
    groupId: GroupId,
    eventId: EventId,
  ): Promise<CareEvent | undefined> {
    this.#activeGeneration();
    return this.#local.findById(groupId, eventId);
  }

  list(query: CareEventQuery): Promise<readonly CareEvent[]> {
    this.#activeGeneration();
    return this.#local.list(query);
  }

  observe(
    query: CareEventQuery,
    listener: (events: readonly CareEvent[]) => void,
  ): () => void {
    const generation = this.#activeGeneration();
    const stopLocal = this.#local.observe(query, listener);
    // Until cursor-aware page reconciliation exists, observe the complete baby
    // feed. A filtered Firestore snapshot cannot distinguish a moved-out event
    // from a deletion and would leave a stale local projection behind.
    const remoteQuery: CareEventQuery = {
      groupId: query.groupId,
      babyId: query.babyId,
      includeDeleted: true,
    };
    let stopRemote: () => void;
    try {
      stopRemote = this.#remote.observe(
        remoteQuery,
        observation => {
          if (!this.#isActive(generation)) {
            return;
          }
          if (observation.kind === 'error') {
            this.#onRemoteError(observation.error);
            return;
          }
          this.#mergeRemoteSnapshot(generation, observation.events).catch(
            error => {
              if (this.#isActive(generation)) {
                this.#onRemoteError({code: 'invalid', cause: error});
              }
            },
          );
        },
      );
    } catch (error) {
      stopLocal();
      throw error;
    }

    let stopped = false;
    const stop = () => {
      if (stopped) {
        return;
      }
      stopped = true;
      this.#observationStops.delete(stop);
      try {
        stopRemote();
      } finally {
        stopLocal();
      }
    };
    this.#observationStops.add(stop);
    if (!this.#isActive(generation)) {
      stop();
      return () => undefined;
    }
    this.syncNow({retryFailed: true}).catch(error => {
      if (this.#isActive(generation)) {
        this.#onRemoteError({code: 'invalid', cause: error});
      }
    });
    return stop;
  }

  getSyncState(eventId: EventId): Promise<CareEventSyncState> {
    this.#activeGeneration();
    return this.#local.getSyncState(eventId);
  }

  observeSyncState(
    listener: (states: readonly CareEventSyncState[]) => void,
  ): () => void {
    this.#activeGeneration();
    return this.#local.observeSyncState(listener);
  }

  async syncNow(options: {readonly retryFailed?: boolean} = {}): Promise<void> {
    const generation = this.#activeGeneration();
    if (options.retryFailed) {
      await this.#local.requeueFailed();
      if (!this.#isActive(generation)) {
        return;
      }
    }
    await this.#requestFlush();
  }

  async retryFailures(
    failureKinds: readonly CareEventSyncFailureKind[],
  ): Promise<void> {
    const generation = this.#activeGeneration();
    await this.#local.requeueFailed(failureKinds);
    if (this.#isActive(generation)) {
      await this.#requestFlush();
    }
  }

  clear(): Promise<void> {
    if (this.#clearPromise) {
      return this.#clearPromise;
    }
    const stopErrors = this.#disposeObservers();
    const operation = this.#local.clear().then(() => {
      if (stopErrors.length > 0) {
        throw new AggregateError(
          stopErrors,
          'Care event remote observer cleanup failed',
        );
      }
    });
    this.#clearPromise = operation;
    operation.catch(() => {
      if (this.#clearPromise === operation) {
        this.#clearPromise = undefined;
      }
    });
    return operation;
  }

  quiesce(): void {
    if (this.#clearPromise || this.#closePromise) {
      return;
    }
    const stopErrors = this.#disposeObservers();
    if (stopErrors.length > 0) {
      throw new AggregateError(
        stopErrors,
        'Care event remote observer cleanup failed',
      );
    }
  }

  close(): Promise<void> {
    if (this.#clearPromise) {
      return this.#clearPromise;
    }
    if (this.#closePromise) {
      return this.#closePromise;
    }
    const stopErrors = this.#disposeObservers();
    this.#closePromise = this.#local.close().then(() => {
      if (stopErrors.length > 0) {
        throw new AggregateError(
          stopErrors,
          'Care event remote observer cleanup failed',
        );
      }
    });
    this.#closePromise.catch(() => {
      this.#closePromise = undefined;
    });
    return this.#closePromise;
  }

  #disposeObservers(): unknown[] {
    this.#disposed = true;
    this.#generation += 1;
    const stopErrors: unknown[] = [];
    for (const stop of [...this.#observationStops]) {
      try {
        stop();
      } catch (error) {
        stopErrors.push(error);
      }
    }
    return stopErrors;
  }

  #requestFlush(): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }
    const generation = this.#generation;
    const requestedFlush = this.#flushTail.then(async () => {
      if (this.#isActive(generation)) {
        await this.#flushLoop(generation);
      }
    });
    this.#flushTail = requestedFlush.catch(() => undefined);
    return requestedFlush;
  }

  #activeGeneration(): number {
    if (this.#disposed) {
      throw new Error('Care event repository is disposed');
    }
    return this.#generation;
  }

  #isActive(generation: number): boolean {
    return !this.#disposed && this.#generation === generation;
  }

  async #mergeRemoteSnapshot(
    generation: number,
    events: readonly CareEvent[],
  ): Promise<void> {
    if (!this.#isActive(generation)) {
      return;
    }
    await this.#local.mergeRemoteEvents(events);
    if (!this.#isActive(generation)) {
      return;
    }
    // A server-confirmed snapshot proves both transport and current Auth access
    // recovered. Permission/invalid failures and conflicts remain failed until
    // their owning flow resolves them.
    await this.#local.requeueFailed(['retryable', 'unauthenticated']);
    if (this.#isActive(generation)) {
      await this.#requestFlush();
    }
  }

  async #flushLoop(generation: number): Promise<void> {
    while (this.#isActive(generation)) {
      const entry = await this.#local.nextPending();
      if (!this.#isActive(generation) || !entry) {
        return;
      }
      const started = await this.#local.markAttemptStarted(entry.id);
      if (!this.#isActive(generation)) {
        return;
      }
      if (!started) {
        continue;
      }
      try {
        const result = await this.#remote.push(started);
        if (!this.#isActive(generation)) {
          return;
        }
        if (result.kind === 'applied' || result.kind === 'already_applied') {
          await this.#local.markSynced(started.id);
          if (!this.#isActive(generation)) {
            return;
          }
          await this.#local.mergeRemoteEvents([result.remote]);
        } else if (result.kind === 'revision_conflict') {
          await this.#local.mergeRemoteEvents([result.remote]);
          if (!this.#isActive(generation)) {
            return;
          }
          await this.#local.markFailed(started.id, 'conflict');
        } else {
          await this.#local.resolveActiveSleepConflict(
            started.id,
            result.remoteActiveSleep,
          );
        }
      } catch (error) {
        if (!this.#isActive(generation)) {
          return;
        }
        const remoteError = thrownRemoteError(error);
        await this.#local.markFailed(started.id, failureKind(remoteError));
        if (this.#isActive(generation)) {
          this.#onRemoteError(remoteError);
        }
        if (
          remoteError.code === 'unauthenticated' ||
          remoteError.code === 'permission_denied'
        ) {
          return;
        }
      }
    }
  }
}
