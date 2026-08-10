import type {
  CareEvent,
  CareEventKind,
  CareEventProjectionRemotePort,
  CareEventProjectionScope,
  CareEventRemoteError,
  CareEventRemoteStorePort,
  CareEventWindowRequest,
  ClockPort,
  EventId,
  LatestCareEventRequest,
  SleepEvent,
} from '@babycare/product-core';
import {
  CARE_EVENT_KINDS,
  compareCareEventNewestFirst,
  isActiveSleep,
} from '@babycare/product-core';

import { isPersistedCareEvent } from './care-event-codec.ts';
import {
  careEventIdentityMatches,
  careEventPayloadHash,
  careEventsEqual,
} from './care-event-revision.ts';
import type {
  CareEventProjectionCoverage,
  CareEventSyncLocalStorePort,
  CareEventSyncState,
} from './persistent-care-event-sync-store.ts';

/**
 * Thirty calendar days plus the 48-hour sleep overlap, with one extra day for
 * local-calendar/DST boundaries. The query is open-ended for live inserts.
 */
export const DEFAULT_CARE_EVENT_OVERVIEW_LOOKBACK_MS =
  33 * 24 * 60 * 60 * 1_000;
const DEFAULT_RECOVERY_RETRY_DELAY_MS = 1_000;
const MAX_RECOVERY_RETRY_DELAY_MS = 30_000;

export type CareEventOverviewStatus =
  | 'loading'
  | 'cached'
  | 'server_confirmed'
  | 'error';

export interface CareEventOverviewFeedState {
  readonly events: readonly CareEvent[];
  readonly activeSleep: SleepEvent | undefined;
  readonly status: CareEventOverviewStatus;
  readonly error?: CareEventRemoteError;
}

export interface CareEventOverviewFeedOptions extends CareEventProjectionScope {
  readonly clock: Pick<ClockPort, 'now'>;
  readonly historyLookbackMs?: number;
  readonly recoveryRetryDelayMs?: number;
  readonly onRemoteError?: (error: CareEventRemoteError) => void;
  /** Requeues mutations only after every overview source is server-confirmed. */
  readonly onServerConfirmed?: () => void | Promise<void>;
}

export type CareEventOverviewRemotePort = CareEventProjectionRemotePort &
  Pick<CareEventRemoteStorePort, 'findById'>;

interface FetchedOverview {
  readonly request: CareEventWindowRequest;
  readonly latestRequests: readonly LatestCareEventRequest[];
  readonly windowEvents: readonly CareEvent[];
  readonly latestEvents: readonly (CareEvent | undefined)[];
  readonly overviewEvents: readonly CareEvent[];
  readonly activeSleep: SleepEvent | undefined;
  readonly reconciledSleep: CareEvent | undefined;
}

interface PreparedObservers {
  readonly epoch: number;
  readonly stops: (() => void)[];
  readonly pendingErrors: CareEventRemoteError[];
  readonly matchedSources: Set<string>;
  readonly expectedSourceCount: number;
  phase: 'preparing' | 'activated' | 'stopped';
  pendingMismatch: boolean;
}

class CareEventOverviewContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CareEventOverviewContractError';
  }
}

function normalizeRemoteError(error: unknown): CareEventRemoteError {
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
  return {
    code:
      error instanceof CareEventOverviewContractError ? 'invalid' : 'retryable',
    cause: error,
  };
}

function shouldAutoRecover(error: CareEventRemoteError): boolean {
  return error.code === 'retryable' || error.code === 'invalid';
}

function eventSignature(event: CareEvent | undefined): string {
  return event
    ? JSON.stringify([
        event.id,
        event.occurredAt,
        event.revision,
        careEventPayloadHash(event),
      ])
    : 'none';
}

function eventsSignature(events: readonly CareEvent[]): string {
  return JSON.stringify(events.map(event => eventSignature(event)));
}

function assertScopedEvent(
  event: CareEvent,
  scope: CareEventProjectionScope,
): void {
  if (
    !isPersistedCareEvent(event) ||
    event.groupId !== scope.groupId ||
    event.babyId !== scope.babyId
  ) {
    throw new CareEventOverviewContractError(
      'Overview projection returned an out-of-scope event',
    );
  }
}

function assertWindowEvents(
  events: readonly CareEvent[],
  request: CareEventWindowRequest,
): void {
  const seen = new Set<EventId>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    assertScopedEvent(event, request);
    if (
      seen.has(event.id) ||
      event.occurredAt < request.from ||
      (request.to !== undefined && event.occurredAt >= request.to) ||
      (request.kinds !== undefined && !request.kinds.includes(event.kind)) ||
      (index > 0 && compareCareEventNewestFirst(events[index - 1]!, event) >= 0)
    ) {
      throw new CareEventOverviewContractError(
        'Overview window violates its ordering or range contract',
      );
    }
    seen.add(event.id);
  }
}

function assertLatestEvent(
  event: CareEvent | undefined,
  request: LatestCareEventRequest,
): void {
  if (!event) {
    return;
  }
  assertScopedEvent(event, request);
  if (event.kind !== request.kind || event.deletedAt !== undefined) {
    throw new CareEventOverviewContractError(
      'Latest projection must return a non-deleted event of its requested kind',
    );
  }
}

function assertActiveSleep(
  event: SleepEvent | undefined,
  scope: CareEventProjectionScope,
): void {
  if (!event) {
    return;
  }
  assertScopedEvent(event, scope);
  if (!isActiveSleep(event)) {
    throw new CareEventOverviewContractError(
      'Active sleep projection returned an inactive event',
    );
  }
}

function mergeProjectionEvents(
  sources: readonly (readonly CareEvent[])[],
): readonly CareEvent[] {
  const merged = new Map<EventId, CareEvent>();
  for (const events of sources) {
    for (const event of events) {
      const existing = merged.get(event.id);
      if (!existing) {
        merged.set(event.id, event);
        continue;
      }
      if (!careEventIdentityMatches(existing, event)) {
        throw new CareEventOverviewContractError(
          'Projection sources disagree on care event identity',
        );
      }
      if (existing.revision === event.revision) {
        if (!careEventsEqual(existing, event)) {
          throw new CareEventOverviewContractError(
            'Projection sources disagree at the same care event revision',
          );
        }
        continue;
      }
      if (event.revision > existing.revision) {
        merged.set(event.id, event);
      }
    }
  }
  return [...merged.values()].sort(compareCareEventNewestFirst);
}

/**
 * Owns the authenticated Home/Stats and active-sleep read projections.
 *
 * It never derives completeness from the bounded timeline. Server window,
 * latest-kind, and singleton reads are persisted as explicitly named refs;
 * pending/failed local mutations remain optimistic overlays.
 */
export class CareEventOverviewFeed {
  readonly #local: CareEventSyncLocalStorePort;
  readonly #remote: CareEventOverviewRemotePort;
  readonly #options: CareEventOverviewFeedOptions;
  readonly #lookbackMs: number;
  readonly #recoveryRetryDelayMs: number;
  readonly #listeners = new Set<(state: CareEventOverviewFeedState) => void>();
  #state: CareEventOverviewFeedState = {
    events: [],
    activeSleep: undefined,
    status: 'loading',
  };
  #allLocalEvents: readonly CareEvent[] = [];
  #syncStates = new Map<EventId, CareEventSyncState>();
  #optimisticEventIds = new Set<EventId>();
  #coverage: CareEventProjectionCoverage = {
    overviewEventIds: [],
    activeSleep: { status: 'unknown' },
  };
  #coverageHydrated = false;
  #localHydrated = false;
  #syncStatesHydrated = false;
  #suppressLocalEmission = false;
  #stopLocal: (() => void) | undefined;
  #stopSyncState: (() => void) | undefined;
  #stopRemoteObservers: readonly (() => void)[] = [];
  #preparedObserverSets = new Set<PreparedObservers>();
  #observerEpochCounter = 0;
  #activeObserverEpoch = 0;
  #terminalRecoveryAttempts = 0;
  #recoveryRebindAttempts = 0;
  #recoveryRebindTimer: ReturnType<typeof setTimeout> | undefined;
  #operationTail: Promise<void> = Promise.resolve();
  #refreshScheduled = false;
  #refreshAgain = false;
  #lifecycleGeneration = 0;
  #started = false;
  #closed = false;

  constructor(
    local: CareEventSyncLocalStorePort,
    remote: CareEventOverviewRemotePort,
    options: CareEventOverviewFeedOptions,
  ) {
    const lookbackMs =
      options.historyLookbackMs ?? DEFAULT_CARE_EVENT_OVERVIEW_LOOKBACK_MS;
    const recoveryRetryDelayMs =
      options.recoveryRetryDelayMs ?? DEFAULT_RECOVERY_RETRY_DELAY_MS;
    if (!Number.isSafeInteger(lookbackMs) || lookbackMs <= 0) {
      throw new Error('Overview history lookback must be a positive integer');
    }
    if (
      !Number.isSafeInteger(recoveryRetryDelayMs) ||
      recoveryRetryDelayMs <= 0
    ) {
      throw new Error('Overview recovery retry delay must be a positive integer');
    }
    this.#local = local;
    this.#remote = remote;
    this.#options = options;
    this.#lookbackMs = lookbackMs;
    this.#recoveryRetryDelayMs = recoveryRetryDelayMs;
  }

  start(listener: (state: CareEventOverviewFeedState) => void): () => void {
    if (this.#closed) {
      throw new Error('Care event overview feed is closed');
    }
    this.#listeners.add(listener);
    try {
      listener(this.#state);
    } catch {
      // Presentation listeners cannot control data ownership.
    }
    if (this.#closed) {
      return () => undefined;
    }

    if (!this.#started) {
      this.#started = true;
      const generation = this.#lifecycleGeneration;
      let stopLocal: (() => void) | undefined;
      let stopSyncState: (() => void) | undefined;
      try {
        stopLocal = this.#local.observe(
        {
          groupId: this.#options.groupId,
          babyId: this.#options.babyId,
          includeDeleted: true,
        },
        events => {
          if (!this.#isActive(generation)) {
            return;
          }
          this.#allLocalEvents = events;
          this.#localHydrated = true;
          if (!this.#suppressLocalEmission) {
            this.#emitVisibleState();
          }
        },
        );
        if (!this.#isActive(generation)) {
          stopLocal();
          return () => undefined;
        }
        this.#stopLocal = stopLocal;
        stopSyncState = this.#local.observeSyncState(states => {
        if (!this.#isActive(generation)) {
          return;
        }
        const previous = this.#syncStates;
        this.#syncStates = new Map(states.map(state => [state.eventId, state]));
        this.#syncStatesHydrated = true;
        let acknowledgedOutsideCoverage = false;
        const covered = this.#coveredIds();
        for (const state of states) {
          if (state.status !== 'synced') {
            this.#optimisticEventIds.add(state.eventId);
          } else if (
            previous.get(state.eventId)?.status !== undefined &&
            previous.get(state.eventId)?.status !== 'synced' &&
            !covered.has(state.eventId)
          ) {
            acknowledgedOutsideCoverage = true;
          }
        }
        if (!this.#suppressLocalEmission) {
          this.#emitVisibleState();
        }
        if (
          acknowledgedOutsideCoverage &&
          this.#coverageHydrated &&
          !this.#suppressLocalEmission
        ) {
          this.#scheduleRefresh(generation);
        }
        });
        if (!this.#isActive(generation)) {
          stopSyncState();
          stopLocal();
          this.#stopLocal = undefined;
          return () => undefined;
        }
        this.#stopSyncState = stopSyncState;
      } catch (error) {
        try {
          stopSyncState?.();
        } catch {
          // Preserve the subscription installation error.
        }
        try {
          stopLocal?.();
        } catch {
          // Preserve the subscription installation error.
        }
        this.#stopLocal = undefined;
        this.#stopSyncState = undefined;
        this.#started = false;
        this.#listeners.delete(listener);
        throw error;
      }
      void this.#enqueue(() => this.#hydrateAndRefresh(generation)).catch(
        error => this.#handleRefreshFailure(error, generation),
      );
    }

    let listening = true;
    return () => {
      if (!listening) {
        return;
      }
      listening = false;
      this.#listeners.delete(listener);
    };
  }

  refresh(): Promise<void> {
    this.#assertStarted();
    const generation = this.#lifecycleGeneration;
    return this.#enqueue(() => this.#refreshFromServer(generation)).catch(
      error => {
        this.#handleRefreshFailure(error, generation);
        throw error;
      },
    );
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#started = false;
    this.#lifecycleGeneration += 1;
    this.#activeObserverEpoch = ++this.#observerEpochCounter;
    this.#stopLocal?.();
    this.#stopLocal = undefined;
    this.#stopSyncState?.();
    this.#stopSyncState = undefined;
    this.#stopAllPreparedObservers();
    this.#replaceRemoteObservers([]);
    if (this.#recoveryRebindTimer !== undefined) {
      clearTimeout(this.#recoveryRebindTimer);
      this.#recoveryRebindTimer = undefined;
    }
    this.#listeners.clear();
  }

  async #hydrateAndRefresh(generation: number): Promise<void> {
    this.#coverage = await this.#local.getProjectionCoverage();
    if (!this.#isActive(generation)) {
      return;
    }
    this.#allLocalEvents = await this.#local.list({
      groupId: this.#options.groupId,
      babyId: this.#options.babyId,
      includeDeleted: true,
    });
    if (!this.#isActive(generation)) {
      return;
    }
    this.#coverageHydrated = true;
    this.#localHydrated = true;
    this.#setState({
      status: this.#hasCachedProjection() ? 'cached' : 'loading',
      events: this.#visibleEvents(),
      activeSleep: this.#visibleActiveSleep(),
    });
    await this.#refreshFromServer(generation);
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const queued = this.#operationTail.then(operation);
    this.#operationTail = queued.catch(() => undefined);
    return queued;
  }

  async #refreshFromServer(generation: number): Promise<void> {
    const fetched = await this.#fetchOverview(generation);
    if (!this.#isActive(generation)) {
      return;
    }
    const prepared = this.#prepareObservers(fetched, generation);
    if (
      !this.#isActive(generation) ||
      prepared.epoch < this.#activeObserverEpoch
    ) {
      this.#stopPreparedObservers(prepared);
      return;
    }

    this.#suppressLocalEmission = true;
    try {
      await this.#local.replaceRemoteProjections(
        fetched.overviewEvents,
        fetched.activeSleep,
        fetched.reconciledSleep,
      );
      this.#coverage = await this.#local.getProjectionCoverage();
      this.#allLocalEvents = await this.#local.list({
        groupId: this.#options.groupId,
        babyId: this.#options.babyId,
        includeDeleted: true,
      });
    } catch (error) {
      this.#stopPreparedObservers(prepared);
      throw error;
    } finally {
      this.#suppressLocalEmission = false;
    }
    if (
      !this.#isActive(generation) ||
      prepared.epoch < this.#activeObserverEpoch
    ) {
      this.#stopPreparedObservers(prepared);
      return;
    }

    this.#coverageHydrated = true;
    this.#localHydrated = true;
    for (const id of this.#optimisticEventIds) {
      const syncState = this.#syncStates.get(id);
      if (
        this.#syncStatesHydrated &&
        (syncState === undefined || syncState.status === 'synced')
      ) {
        this.#optimisticEventIds.delete(id);
      }
    }
    const observerHadTerminalError = this.#activateObservers(
      prepared,
      generation,
    );
    if (observerHadTerminalError || !this.#isActive(generation)) {
      return;
    }
    this.#setState(
      {
        status: 'server_confirmed',
        events: this.#visibleEvents(),
        activeSleep: this.#visibleActiveSleep(),
      },
      true,
    );
    if (!this.#isActive(generation)) {
      return;
    }
    if (this.#options.onServerConfirmed) {
      try {
        void Promise.resolve(this.#options.onServerConfirmed()).catch(error => {
          if (this.#isActive(generation)) {
            this.#deliverRemoteError(normalizeRemoteError(error));
          }
        });
      } catch (error) {
        this.#deliverRemoteError(normalizeRemoteError(error));
      }
    }
  }

  async #fetchOverview(generation: number): Promise<FetchedOverview> {
    const now = this.#options.clock.now();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new CareEventOverviewContractError(
        'Overview clock must return a valid timestamp',
      );
    }
    const request: CareEventWindowRequest = {
      groupId: this.#options.groupId,
      babyId: this.#options.babyId,
      from: Math.max(0, now - this.#lookbackMs),
    };
    const latestRequests = CARE_EVENT_KINDS.map(kind => ({
      groupId: this.#options.groupId,
      babyId: this.#options.babyId,
      kind,
    }));
    const previousCoverage = await this.#local.getProjectionCoverage();
    if (!this.#isActive(generation)) {
      return {
        request,
        latestRequests,
        windowEvents: [],
        latestEvents: [],
        overviewEvents: [],
        activeSleep: undefined,
        reconciledSleep: undefined,
      };
    }
    const [windowEvents, latestEvents, activeSleep] = await Promise.all([
      this.#remote.fetchWindow(request),
      Promise.all(
        latestRequests.map(latestRequest =>
          this.#remote.fetchLatest(latestRequest),
        ),
      ),
      this.#remote.fetchActiveSleep(request),
    ]);
    assertWindowEvents(windowEvents, request);
    for (let index = 0; index < latestRequests.length; index += 1) {
      assertLatestEvent(latestEvents[index], latestRequests[index]!);
    }
    assertActiveSleep(activeSleep, request);
    const overviewEvents = mergeProjectionEvents([
      windowEvents,
      latestEvents.filter((event): event is CareEvent => event !== undefined),
    ]);
    if (activeSleep) {
      const sameEvent = overviewEvents.find(event => event.id === activeSleep.id);
      if (sameEvent && !careEventsEqual(sameEvent, activeSleep)) {
        throw new CareEventOverviewContractError(
          'Overview and active sleep projections disagree on the same event',
        );
      }
    }

    let previousActiveId =
      previousCoverage.activeSleep.status === 'active'
        ? previousCoverage.activeSleep.eventId
        : undefined;
    if (
      !previousActiveId &&
      previousCoverage.activeSleep.status === 'unknown'
    ) {
      const localEvents = await this.#local.list({
        groupId: this.#options.groupId,
        babyId: this.#options.babyId,
        kinds: ['sleep'],
      });
      for (const event of localEvents) {
        if (
          isActiveSleep(event) &&
          (await this.#local.getSyncState(event.id)).status === 'synced'
        ) {
          previousActiveId = event.id;
          break;
        }
      }
    }

    let reconciledSleep: CareEvent | undefined;
    if (previousActiveId && previousActiveId !== activeSleep?.id) {
      const remotePrevious = await this.#remote.findById(
        this.#options.groupId,
        previousActiveId,
      );
      if (!remotePrevious) {
        throw new CareEventOverviewContractError(
          'Active sleep lock transition lost its previous event',
        );
      }
      assertScopedEvent(remotePrevious, request);
      if (
        remotePrevious.id !== previousActiveId ||
        remotePrevious.kind !== 'sleep' ||
        (remotePrevious.endedAt === undefined &&
          remotePrevious.deletedAt === undefined)
      ) {
        throw new CareEventOverviewContractError(
          'Active sleep lock transition did not reconcile its previous event',
        );
      }
      reconciledSleep = remotePrevious;
    }

    return {
      request,
      latestRequests,
      windowEvents,
      latestEvents,
      overviewEvents,
      activeSleep,
      reconciledSleep,
    };
  }

  #prepareObservers(
    fetched: FetchedOverview,
    generation: number,
  ): PreparedObservers {
    const prepared: PreparedObservers = {
      epoch: ++this.#observerEpochCounter,
      stops: [],
      pendingErrors: [],
      matchedSources: new Set<string>(),
      expectedSourceCount: fetched.latestRequests.length + 2,
      phase: 'preparing',
      pendingMismatch: false,
    };
    this.#preparedObserverSets.add(prepared);
    const onError = (error: CareEventRemoteError) => {
      if (this.#activeObserverEpoch === prepared.epoch) {
        this.#handleTerminalObserverError(error, generation, prepared.epoch);
      } else if (prepared.epoch > this.#activeObserverEpoch) {
        prepared.pendingErrors.push(error);
      }
    };
    const onMismatch = () => {
      if (this.#activeObserverEpoch === prepared.epoch) {
        this.#scheduleRefresh(generation);
      } else if (prepared.epoch > this.#activeObserverEpoch) {
        prepared.pendingMismatch = true;
      }
    };
    const onMatch = (source: string) => {
      prepared.matchedSources.add(source);
      if (this.#activeObserverEpoch !== prepared.epoch) {
        return;
      }
      if (prepared.matchedSources.size === prepared.expectedSourceCount) {
        this.#terminalRecoveryAttempts = 0;
        this.#recoveryRebindAttempts = 0;
      }
      if (this.#state.status === 'error') {
        this.#scheduleRefresh(generation);
      }
    };

    try {
      const expectedWindow = eventsSignature(fetched.windowEvents);
      this.#addPreparedObserver(
        prepared,
        this.#remote.observeWindow(fetched.request, observation => {
          if (!this.#isActive(generation)) {
            return;
          }
          if (observation.kind === 'error') {
            onError(observation.error);
            return;
          }
          try {
            assertWindowEvents(observation.events, fetched.request);
            if (eventsSignature(observation.events) !== expectedWindow) {
              onMismatch();
            } else {
              onMatch('window');
            }
          } catch (error) {
            onError(normalizeRemoteError(error));
          }
        }),
      );

      for (let index = 0; index < fetched.latestRequests.length; index += 1) {
        const request = fetched.latestRequests[index]!;
        const expected = eventSignature(fetched.latestEvents[index]);
        this.#addPreparedObserver(
          prepared,
          this.#remote.observeLatest(request, observation => {
            if (!this.#isActive(generation)) {
              return;
            }
            if (observation.kind === 'error') {
              onError(observation.error);
              return;
            }
            try {
              assertLatestEvent(observation.event, request);
              if (eventSignature(observation.event) !== expected) {
                onMismatch();
              } else {
                onMatch(`latest:${request.kind}`);
              }
            } catch (error) {
              onError(normalizeRemoteError(error));
            }
          }),
        );
      }

      const expectedActive = eventSignature(fetched.activeSleep);
      this.#addPreparedObserver(
        prepared,
        this.#remote.observeActiveSleep(fetched.request, observation => {
          if (!this.#isActive(generation)) {
            return;
          }
          if (observation.kind === 'error') {
            onError(observation.error);
            return;
          }
          try {
            assertActiveSleep(observation.event, fetched.request);
            if (eventSignature(observation.event) !== expectedActive) {
              onMismatch();
            } else {
              onMatch('active');
            }
          } catch (error) {
            onError(normalizeRemoteError(error));
          }
        }),
      );
    } catch (error) {
      this.#stopPreparedObservers(prepared);
      throw error;
    }
    return prepared;
  }

  #activateObservers(
    prepared: PreparedObservers,
    generation: number,
  ): boolean {
    if (prepared.phase !== 'preparing') {
      return true;
    }
    prepared.phase = 'activated';
    this.#preparedObserverSets.delete(prepared);
    this.#activeObserverEpoch = prepared.epoch;
    this.#replaceRemoteObservers(prepared.stops);
    const hadTerminalError = prepared.pendingErrors.length > 0;
    for (const error of prepared.pendingErrors) {
      this.#handleTerminalObserverError(error, generation, prepared.epoch);
    }
    if (
      this.#activeObserverEpoch === prepared.epoch &&
      prepared.matchedSources.size === prepared.expectedSourceCount
    ) {
      this.#terminalRecoveryAttempts = 0;
      this.#recoveryRebindAttempts = 0;
    }
    if (
      prepared.pendingMismatch &&
      this.#activeObserverEpoch === prepared.epoch
    ) {
      this.#scheduleRefresh(generation);
    }
    return hadTerminalError;
  }

  #stopPreparedObservers(prepared: PreparedObservers): void {
    if (prepared.phase !== 'preparing') {
      return;
    }
    prepared.phase = 'stopped';
    this.#preparedObserverSets.delete(prepared);
    for (const stop of prepared.stops) {
      try {
        stop();
      } catch {
        // A never-activated observer owns no durable state.
      }
    }
  }

  #addPreparedObserver(
    prepared: PreparedObservers,
    stop: () => void,
  ): void {
    if (prepared.phase === 'preparing') {
      prepared.stops.push(stop);
      return;
    }
    try {
      stop();
    } catch {
      // The prepared set was already stopped while the observer was installed.
    }
  }

  #stopAllPreparedObservers(): void {
    for (const prepared of [...this.#preparedObserverSets]) {
      this.#stopPreparedObservers(prepared);
    }
  }

  #replaceRemoteObservers(stops: readonly (() => void)[]): void {
    const previous = this.#stopRemoteObservers;
    this.#stopRemoteObservers = stops;
    for (const stop of previous) {
      try {
        stop();
      } catch {
        // Observer cleanup cannot roll back an already persisted projection.
      }
    }
  }

  #handleTerminalObserverError(
    error: CareEventRemoteError,
    generation: number,
    epoch: number,
  ): void {
    if (
      this.#activeObserverEpoch !== epoch ||
      !this.#isActive(generation)
    ) {
      return;
    }
    this.#setState({status: 'error', error});
    this.#deliverRemoteError(error);
    this.#activeObserverEpoch = ++this.#observerEpochCounter;
    this.#replaceRemoteObservers([]);
    if (error.code === 'retryable') {
      if (this.#terminalRecoveryAttempts < 1) {
        this.#terminalRecoveryAttempts += 1;
        this.#scheduleRefresh(generation);
      } else {
        this.#scheduleRecoveryRebind(generation);
      }
    } else if (error.code === 'invalid') {
      this.#scheduleRecoveryRebind(generation);
    }
  }

  #scheduleRefresh(generation: number): void {
    if (!this.#isActive(generation)) {
      return;
    }
    if (this.#refreshScheduled) {
      this.#refreshAgain = true;
      return;
    }
    this.#refreshScheduled = true;
    void this.refresh()
      .catch(() => undefined)
      .finally(() => {
        this.#refreshScheduled = false;
        if (this.#refreshAgain && this.#isActive(generation)) {
          this.#refreshAgain = false;
          this.#scheduleRefresh(generation);
        }
      });
  }

  #installRecoveryObserver(generation: number): void {
    if (this.#stopRemoteObservers.length > 0 || !this.#isActive(generation)) {
      return;
    }
    const now = this.#options.clock.now();
    if (!Number.isSafeInteger(now) || now < 0) {
      return;
    }
    const request: CareEventWindowRequest = {
      groupId: this.#options.groupId,
      babyId: this.#options.babyId,
      from: Math.max(0, now - this.#lookbackMs),
    };
    const epoch = ++this.#observerEpochCounter;
    this.#activeObserverEpoch = epoch;
    let stop: () => void;
    try {
      stop = this.#remote.observeWindow(request, observation => {
        if (
          !this.#isActive(generation) ||
          this.#activeObserverEpoch !== epoch
        ) {
          return;
        }
        if (observation.kind === 'error') {
          this.#setState({status: 'error', error: observation.error});
          this.#deliverRemoteError(observation.error);
          this.#activeObserverEpoch = ++this.#observerEpochCounter;
          this.#replaceRemoteObservers([]);
          if (shouldAutoRecover(observation.error)) {
            this.#scheduleRecoveryRebind(generation);
          }
          return;
        }
        try {
          assertWindowEvents(observation.events, request);
          this.#scheduleRefresh(generation);
        } catch (error) {
          this.#deliverRemoteError(normalizeRemoteError(error));
        }
      });
    } catch (error) {
      const remoteError = normalizeRemoteError(error);
      this.#activeObserverEpoch = ++this.#observerEpochCounter;
      this.#deliverRemoteError(remoteError);
      if (shouldAutoRecover(remoteError)) {
        this.#scheduleRecoveryRebind(generation);
      }
      return;
    }
    if (
      !this.#isActive(generation) ||
      this.#activeObserverEpoch !== epoch
    ) {
      try {
        stop();
      } catch {
        // The feed already closed.
      }
      return;
    }
    this.#replaceRemoteObservers([stop]);
  }

  #scheduleRecoveryRebind(generation: number): void {
    if (
      !this.#isActive(generation) ||
      this.#recoveryRebindTimer !== undefined
    ) {
      return;
    }
    const exponent = Math.min(this.#recoveryRebindAttempts, 5);
    const delay = Math.min(
      this.#recoveryRetryDelayMs * 2 ** exponent,
      MAX_RECOVERY_RETRY_DELAY_MS,
    );
    this.#recoveryRebindAttempts += 1;
    this.#recoveryRebindTimer = setTimeout(() => {
      this.#recoveryRebindTimer = undefined;
      if (this.#isActive(generation)) {
        this.#installRecoveryObserver(generation);
      }
    }, delay);
  }

  #handleRefreshFailure(error: unknown, generation: number): void {
    if (!this.#isActive(generation)) {
      return;
    }
    const remoteError = normalizeRemoteError(error);
    this.#setState({ status: 'error', error: remoteError });
    this.#deliverRemoteError(remoteError);
    if (shouldAutoRecover(remoteError)) {
      this.#installRecoveryObserver(generation);
    }
  }

  #coveredIds(): Set<EventId> {
    const covered = new Set(this.#coverage.overviewEventIds);
    if (this.#coverage.activeSleep.status === 'active') {
      covered.add(this.#coverage.activeSleep.eventId);
    }
    return covered;
  }

  #visibleEvents(): readonly CareEvent[] {
    if (
      !this.#coverageHydrated ||
      !this.#localHydrated ||
      !this.#syncStatesHydrated
    ) {
      return [];
    }
    const covered = this.#coveredIds();
    return this.#allLocalEvents
      .filter(event => event.deletedAt === undefined)
      .filter(
        event =>
          covered.has(event.id) ||
          this.#optimisticEventIds.has(event.id) ||
          (this.#syncStates.has(event.id) &&
            this.#syncStates.get(event.id)?.status !== 'synced'),
      )
      .sort(compareCareEventNewestFirst);
  }

  #visibleActiveSleep(): SleepEvent | undefined {
    const events = this.#visibleEvents();
    if (this.#coverage.activeSleep.status === 'active') {
      const projectedActiveId = this.#coverage.activeSleep.eventId;
      const projected = events.find(event => event.id === projectedActiveId);
      return projected && isActiveSleep(projected) ? projected : undefined;
    }
    return events.find(event => {
      if (!isActiveSleep(event)) {
        return false;
      }
      if (this.#coverage.activeSleep.status === 'unknown') {
        return true;
      }
      return this.#syncStates.get(event.id)?.status !== 'synced';
    }) as SleepEvent | undefined;
  }

  #hasCachedProjection(): boolean {
    return (
      this.#coverage.overviewEventIds.length > 0 ||
      this.#coverage.activeSleep.status !== 'unknown'
    );
  }

  #emitVisibleState(): void {
    this.#setState({
      events: this.#visibleEvents(),
      activeSleep: this.#visibleActiveSleep(),
    });
  }

  #setState(
    patch: Partial<CareEventOverviewFeedState>,
    clearError = false,
  ): void {
    const next = { ...this.#state, ...patch };
    if (clearError) {
      delete (next as { error?: CareEventRemoteError }).error;
    }
    this.#state = next;
    for (const listener of this.#listeners) {
      try {
        listener(this.#state);
      } catch {
        // Presentation listeners cannot alter coordinator state.
      }
    }
  }

  #deliverRemoteError(error: CareEventRemoteError): void {
    try {
      this.#options.onRemoteError?.(error);
    } catch {
      // Error reporting cannot corrupt a durable projection.
    }
  }

  #assertStarted(): void {
    if (this.#closed) {
      throw new Error('Care event overview feed is closed');
    }
    if (!this.#started) {
      throw new Error('Care event overview feed must be started first');
    }
  }

  #isActive(generation: number): boolean {
    return (
      !this.#closed && this.#started && this.#lifecycleGeneration === generation
    );
  }
}
