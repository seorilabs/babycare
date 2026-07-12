import type {
  BabyId,
  CareEvent,
  CareEventCursor,
  CareEventPageRequest,
  CareEventRemoteError,
  CareEventRemotePage,
  CareEventRemoteStorePort,
  GroupId,
} from '@babycare/product-core';
import {
  careEventCursorFromEvent,
  compareCareEventNewestFirst,
  isCareEventAfterCursor,
  validateCareEventPageRequest,
} from '@babycare/product-core';

import {careEventPayloadHash} from './care-event-revision.ts';
import type {
  CareEventSyncLocalStorePort,
  CareEventSyncState,
  CareEventTimelineCoverage,
} from './persistent-care-event-sync-store.ts';

export interface CareEventTimelineFeedConfig {
  readonly pageSize: number;
  readonly maxCachedEvents: number;
  readonly maxScanPagesPerLoad: number;
}

export interface CareEventTimelineFeedOptions
  extends CareEventTimelineFeedConfig {
  readonly groupId: GroupId;
  readonly babyId: BabyId;
  readonly onRemoteError?: (error: CareEventRemoteError) => void;
  /** Requeues and flushes mutations only after a server-confirmed page. */
  readonly onServerConfirmed?: () => void | Promise<void>;
}

export interface CareEventTimelineFeedState {
  readonly events: readonly CareEvent[];
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loadMoreError: string | undefined;
  /** More server rows exist, but the configured local cache bound was hit. */
  readonly capped: boolean;
}

interface ObservedPage {
  readonly request: CareEventPageRequest;
  readonly signature: string;
}

interface FetchedPrefix {
  readonly events: readonly CareEvent[];
  readonly coverage: CareEventTimelineCoverage;
  readonly pages: readonly ObservedPage[];
}

interface PreparedPageObservers {
  readonly epoch: number;
  readonly stops: (() => void)[];
  readonly pendingErrors: CareEventRemoteError[];
  readonly matchedPages: Set<number>;
  readonly expectedPageCount: number;
  phase: 'preparing' | 'activated' | 'stopped';
  pendingMismatch: boolean;
}

const LOAD_MORE_ERROR_MESSAGE = '이전 기록을 불러오지 못했어요.';
const RECOVERY_RETRY_DELAY_MS = 1_000;
const MAX_RECOVERY_RETRY_DELAY_MS = 30_000;

class CareEventTimelineContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CareEventTimelineContractError';
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
    code: error instanceof Error ? 'invalid' : 'retryable',
    cause: error,
  };
}

function shouldAutoRecover(error: CareEventRemoteError): boolean {
  return error.code === 'retryable' || error.code === 'invalid';
}

function cursorEqual(
  left: CareEventCursor | undefined,
  right: CareEventCursor | undefined,
): boolean {
  return (
    left?.occurredAt === right?.occurredAt &&
    left?.eventId === right?.eventId
  );
}

function pageSignature(page: CareEventRemotePage): string {
  return JSON.stringify({
    rows: page.events.map(event => [
      event.id,
      event.occurredAt,
      event.revision,
      careEventPayloadHash(event),
    ]),
    endCursor: page.endCursor,
    hasMore: page.hasMore,
  });
}

function assertRemotePage(
  page: CareEventRemotePage,
  request: CareEventPageRequest,
): void {
  if (page.events.length > request.pageSize) {
    throw new CareEventTimelineContractError(
      'Remote timeline page exceeded the requested page size',
    );
  }
  if (page.events.length === 0) {
    if (page.endCursor !== undefined || page.hasMore) {
      throw new CareEventTimelineContractError(
        'An empty remote timeline page cannot advance a cursor',
      );
    }
    return;
  }

  const seen = new Set<string>();
  for (let index = 0; index < page.events.length; index += 1) {
    const event = page.events[index]!;
    if (
      event.groupId !== request.groupId ||
      event.babyId !== request.babyId ||
      seen.has(event.id) ||
      (request.after !== undefined &&
        !isCareEventAfterCursor(event, request.after)) ||
      (index > 0 &&
        compareCareEventNewestFirst(page.events[index - 1]!, event) >= 0)
    ) {
      throw new CareEventTimelineContractError(
        'Remote timeline page violates its cursor contract',
      );
    }
    seen.add(event.id);
  }

  const expectedCursor = careEventCursorFromEvent(page.events.at(-1)!);
  if (!cursorEqual(page.endCursor, expectedCursor)) {
    throw new CareEventTimelineContractError(
      'Remote timeline page cursor does not match its final row',
    );
  }
}

function assertConfig(config: CareEventTimelineFeedConfig): void {
  validateCareEventPageRequest({
    groupId: 'validation-group' as GroupId,
    babyId: 'validation-baby' as BabyId,
    pageSize: config.pageSize,
  });
  if (
    !Number.isSafeInteger(config.maxCachedEvents) ||
    config.maxCachedEvents < config.pageSize
  ) {
    throw new Error('maxCachedEvents must be at least one full page');
  }
  if (
    !Number.isSafeInteger(config.maxScanPagesPerLoad) ||
    config.maxScanPagesPerLoad < 1
  ) {
    throw new Error('maxScanPagesPerLoad must be a positive integer');
  }
}

/**
 * Maintains a bounded raw server prefix behind the local-first store.
 *
 * Every listener boundary is treated as provisional: when any page changes,
 * the complete loaded prefix is fetched again from HEAD and replaced in one
 * durable store commit. This prevents insertions, moves and tombstones at a
 * page boundary from producing duplicates or stale rows.
 */
export class CareEventTimelineFeed {
  readonly #local: CareEventSyncLocalStorePort;
  readonly #remote: CareEventRemoteStorePort;
  readonly #options: CareEventTimelineFeedOptions;
  readonly #listeners = new Set<
    (state: CareEventTimelineFeedState) => void
  >();
  #state: CareEventTimelineFeedState = {
    events: [],
    hasMore: true,
    loadingMore: false,
    loadMoreError: undefined,
    capped: false,
  };
  #allLocalEvents: readonly CareEvent[] = [];
  #syncStates = new Map<string, CareEventSyncState>();
  #syncStatesHydrated = false;
  #optimisticEventIds = new Set<string>();
  #coverage: CareEventTimelineCoverage = {
    remoteEventIds: [],
    hasMore: true,
    loadedRawCount: 0,
  };
  #coverageHydrated = false;
  #suppressLocalEmission = false;
  #stopLocal: (() => void) | undefined;
  #stopSyncState: (() => void) | undefined;
  #stopRemotePages: readonly (() => void)[] = [];
  #preparedPageObserverSets = new Set<PreparedPageObservers>();
  #observerEpochCounter = 0;
  #activeObserverEpoch = 0;
  #operationTail: Promise<void> = Promise.resolve();
  #loadMorePromise: Promise<void> | undefined;
  #refreshScheduled = false;
  #refreshAgain = false;
  #terminalRecoveryAttempts = 0;
  #recoveryRebindAttempts = 0;
  #recoveryRebindTimer: ReturnType<typeof setTimeout> | undefined;
  #lifecycleGeneration = 0;
  #started = false;
  #closed = false;

  constructor(
    local: CareEventSyncLocalStorePort,
    remote: CareEventRemoteStorePort,
    options: CareEventTimelineFeedOptions,
  ) {
    assertConfig(options);
    this.#local = local;
    this.#remote = remote;
    this.#options = options;
  }

  start(
    listener: (state: CareEventTimelineFeedState) => void,
  ): () => void {
    if (this.#closed) {
      throw new Error('Care event timeline feed is closed');
    }
    this.#listeners.add(listener);
    try {
      listener(this.#state);
    } catch {
      // Initial delivery follows the same presentation isolation as updates.
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
        },
        events => {
          if (this.#isActive(generation)) {
            this.#allLocalEvents = events;
            if (!this.#suppressLocalEmission) {
              this.#setState({events: this.#visibleEvents()});
            }
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
        const previousStates = this.#syncStates;
        this.#syncStates = new Map(states.map(state => [state.eventId, state]));
        this.#syncStatesHydrated = true;
        let acknowledgedOutsideCoverage = false;
        for (const state of states) {
          if (state.status !== 'synced') {
            this.#optimisticEventIds.add(state.eventId);
          } else if (
            previousStates.get(state.eventId)?.status !== undefined &&
            previousStates.get(state.eventId)?.status !== 'synced' &&
            !this.#coverage.remoteEventIds.includes(state.eventId)
          ) {
            acknowledgedOutsideCoverage = true;
          }
        }
        if (!this.#suppressLocalEmission) {
          this.#setState({events: this.#visibleEvents()});
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
      void this.#hydrateCoverageAndRefresh(generation);
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
    return this.#enqueue(async () => {
      const coverage = await this.#local.getTimelineCoverage();
      if (!this.#isActive(generation)) {
        return;
      }
      const target = Math.max(
        this.#options.pageSize,
        Math.min(coverage.loadedRawCount, this.#options.maxCachedEvents),
      );
      await this.#replaceFromHead(generation, target);
    });
  }

  loadMore(): Promise<void> {
    this.#assertStarted();
    if (this.#loadMorePromise) {
      return this.#loadMorePromise;
    }
    if (!this.#state.hasMore || this.#state.capped) {
      return Promise.resolve();
    }

    const generation = this.#lifecycleGeneration;
    this.#setState({loadingMore: true, loadMoreError: undefined});
    const operation = this.#enqueue(async () => {
      const oldCoverage = await this.#local.getTimelineCoverage();
      if (!this.#isActive(generation)) {
        return;
      }
      const allLocalEvents = await this.#local.list({
        groupId: this.#options.groupId,
        babyId: this.#options.babyId,
        includeDeleted: true,
      });
      if (!this.#isActive(generation)) {
        return;
      }
      const localById = new Map(allLocalEvents.map(event => [event.id, event]));
      const oldVisibleRemoteCount = oldCoverage.remoteEventIds.filter(
        id => localById.get(id)?.deletedAt === undefined,
      ).length;
      const target = Math.min(
        this.#options.maxCachedEvents,
        oldCoverage.loadedRawCount + this.#options.pageSize,
      );
      await this.#replaceFromHead(
        generation,
        target,
        oldCoverage.loadedRawCount,
        oldVisibleRemoteCount,
      );
    });
    this.#loadMorePromise = operation
      .catch(error => {
        if (this.#isActive(generation)) {
          this.#reportRemoteError(error);
          this.#setState({
            loadingMore: false,
            loadMoreError: LOAD_MORE_ERROR_MESSAGE,
          });
        }
        throw error;
      })
      .finally(() => {
        if (this.#isActive(generation)) {
          this.#setState({loadingMore: false});
        }
        this.#loadMorePromise = undefined;
      });
    return this.#loadMorePromise;
  }

  retryLoadMore(): Promise<void> {
    return this.loadMore();
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

  async #hydrateCoverageAndRefresh(generation: number): Promise<void> {
    try {
      const coverage = await this.#local.getTimelineCoverage();
      if (!this.#isActive(generation)) {
        return;
      }
      this.#allLocalEvents = await this.#local.list({
        groupId: this.#options.groupId,
        babyId: this.#options.babyId,
      });
      if (!this.#isActive(generation)) {
        return;
      }
      this.#applyCoverageState(coverage);
      await this.refresh();
    } catch (error) {
      if (this.#isActive(generation)) {
        const remoteError = normalizeRemoteError(error);
        this.#deliverRemoteError(remoteError);
        this.#setState({loadMoreError: LOAD_MORE_ERROR_MESSAGE});
        if (shouldAutoRecover(remoteError)) {
          this.#installHeadRecoveryObserver(generation);
        }
      }
    }
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const queued = this.#operationTail.then(operation);
    this.#operationTail = queued.catch(() => undefined);
    return queued;
  }

  async #replaceFromHead(
    generation: number,
    targetRawCount: number,
    previousRawCount = -1,
    previousVisibleRemoteCount = -1,
  ): Promise<void> {
    const prefix = await this.#fetchPrefix(
      generation,
      targetRawCount,
      previousRawCount,
      previousVisibleRemoteCount,
    );
    if (!this.#isActive(generation)) {
      return;
    }
    const preparedObservers = this.#preparePageObservers(
      prefix.pages,
      generation,
    );
    if (
      !this.#isActive(generation) ||
      preparedObservers.epoch < this.#activeObserverEpoch
    ) {
      this.#stopPreparedObservers(preparedObservers);
      return;
    }
    this.#suppressLocalEmission = true;
    try {
      await this.#local.replaceRemoteTimelinePrefix(
        prefix.events,
        prefix.coverage,
      );
    } catch (error) {
      this.#stopPreparedObservers(preparedObservers);
      throw error;
    } finally {
      this.#suppressLocalEmission = false;
    }
    if (
      !this.#isActive(generation) ||
      preparedObservers.epoch < this.#activeObserverEpoch
    ) {
      this.#stopPreparedObservers(preparedObservers);
      return;
    }
    this.#applyCoverageState(prefix.coverage);
    if (!this.#isActive(generation)) {
      this.#stopPreparedObservers(preparedObservers);
      return;
    }
    const observerHadTerminalError = this.#activatePageObservers(
      preparedObservers,
      generation,
    );
    if (!observerHadTerminalError && this.#options.onServerConfirmed) {
      try {
        void Promise.resolve(this.#options.onServerConfirmed()).catch(error => {
          if (this.#isActive(generation)) {
            this.#reportRemoteError(error);
          }
        });
      } catch (error) {
        if (this.#isActive(generation)) {
          this.#reportRemoteError(error);
        }
      }
    }
  }

  async #fetchPrefix(
    generation: number,
    targetRawCount: number,
    previousRawCount: number,
    previousVisibleRemoteCount: number,
  ): Promise<FetchedPrefix> {
    const events: CareEvent[] = [];
    const pages: ObservedPage[] = [];
    const seen = new Set<string>();
    let after: CareEventCursor | undefined;
    let hasMore = true;
    let extensionPages = 0;

    while (hasMore && events.length < this.#options.maxCachedEvents) {
      const remainingCapacity = this.#options.maxCachedEvents - events.length;
      const request: CareEventPageRequest = {
        groupId: this.#options.groupId,
        babyId: this.#options.babyId,
        pageSize: Math.min(this.#options.pageSize, remainingCapacity),
        ...(after ? {after} : {}),
      };
      const page = await this.#remote.fetchPage(request);
      if (!this.#isActive(generation)) {
        return {
          events: [],
          coverage: {
            remoteEventIds: [],
            hasMore: true,
            loadedRawCount: 0,
          },
          pages: [],
        };
      }
      assertRemotePage(page, request);
      for (const event of page.events) {
        if (seen.has(event.id)) {
          throw new CareEventTimelineContractError(
            'Remote timeline prefix contains a duplicate row',
          );
        }
        if (after && !isCareEventAfterCursor(event, after)) {
          throw new CareEventTimelineContractError(
            'Remote timeline pages overlap their cursor',
          );
        }
        seen.add(event.id);
        events.push(event);
      }
      pages.push({request, signature: pageSignature(page)});
      hasMore = page.hasMore;
      after = page.endCursor;

      if (previousRawCount >= 0 && events.length > previousRawCount) {
        extensionPages += 1;
      }
      const reachedTarget = events.length >= targetRawCount || !hasMore;
      if (!reachedTarget) {
        continue;
      }
      if (previousRawCount < 0) {
        break;
      }
      const visibleRemoteCount = events.filter(
        event => event.deletedAt === undefined,
      ).length;
      if (
        visibleRemoteCount > previousVisibleRemoteCount ||
        extensionPages >= this.#options.maxScanPagesPerLoad ||
        !hasMore
      ) {
        break;
      }
    }

    const last = events.at(-1);
    return {
      events,
      coverage: {
        remoteEventIds: events.map(event => event.id),
        ...(last ? {endCursor: careEventCursorFromEvent(last)} : {}),
        hasMore,
        loadedRawCount: events.length,
      },
      pages,
    };
  }

  #preparePageObservers(
    pages: readonly ObservedPage[],
    generation: number,
  ): PreparedPageObservers {
    const prepared: PreparedPageObservers = {
      epoch: ++this.#observerEpochCounter,
      stops: [],
      pendingErrors: [],
      matchedPages: new Set<number>(),
      expectedPageCount: pages.length,
      phase: 'preparing',
      pendingMismatch: false,
    };
    this.#preparedPageObserverSets.add(prepared);
    try {
      for (const [pageIndex, page] of pages.entries()) {
        this.#addPreparedObserver(
          prepared,
          this.#remote.observePage(page.request, observation => {
            if (!this.#isActive(generation)) {
              return;
            }
            if (observation.kind === 'error') {
              if (this.#activeObserverEpoch === prepared.epoch) {
                this.#handleTerminalPageError(
                  observation.error,
                  generation,
                  prepared.epoch,
                );
              } else if (prepared.epoch > this.#activeObserverEpoch) {
                prepared.pendingErrors.push(observation.error);
              }
              return;
            }
            try {
              assertRemotePage(observation.page, page.request);
              if (pageSignature(observation.page) !== page.signature) {
                if (this.#activeObserverEpoch === prepared.epoch) {
                  this.#scheduleRefresh(generation);
                } else if (prepared.epoch > this.#activeObserverEpoch) {
                  prepared.pendingMismatch = true;
                }
              } else {
                prepared.matchedPages.add(pageIndex);
                if (
                  this.#activeObserverEpoch === prepared.epoch &&
                  prepared.matchedPages.size === prepared.expectedPageCount
                ) {
                  this.#markObserverSetHealthy();
                }
              }
            } catch (error) {
              if (this.#activeObserverEpoch === prepared.epoch) {
                this.#handleTerminalPageError(
                  normalizeRemoteError(error),
                  generation,
                  prepared.epoch,
                );
              } else if (prepared.epoch > this.#activeObserverEpoch) {
                prepared.pendingErrors.push(normalizeRemoteError(error));
              }
            }
          }),
        );
      }
    } catch (error) {
      this.#stopPreparedObservers(prepared);
      throw error;
    }
    return prepared;
  }

  #installHeadRecoveryObserver(generation: number): void {
    if (
      this.#stopRemotePages.length > 0 ||
      !this.#isActive(generation)
    ) {
      return;
    }
    const request: CareEventPageRequest = {
      groupId: this.#options.groupId,
      babyId: this.#options.babyId,
      pageSize: this.#options.pageSize,
    };
    const epoch = ++this.#observerEpochCounter;
    this.#activeObserverEpoch = epoch;
    let stop: () => void;
    try {
      stop = this.#remote.observePage(request, observation => {
        if (
          !this.#isActive(generation) ||
          this.#activeObserverEpoch !== epoch
        ) {
          return;
        }
        if (observation.kind === 'error') {
          this.#handleTerminalPageError(
            observation.error,
            generation,
            epoch,
          );
          return;
        }
        try {
          assertRemotePage(observation.page, request);
          this.#scheduleRefresh(generation);
        } catch (error) {
          this.#handleTerminalPageError(
            normalizeRemoteError(error),
            generation,
            epoch,
          );
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
        // The feed already closed; no observer state remains to update.
      }
      return;
    }
    this.#replaceRemoteObservers([stop]);
  }

  #activatePageObservers(
    prepared: PreparedPageObservers,
    generation: number,
  ): boolean {
    if (prepared.phase !== 'preparing') {
      return true;
    }
    prepared.phase = 'activated';
    this.#preparedPageObserverSets.delete(prepared);
    this.#activeObserverEpoch = prepared.epoch;
    this.#replaceRemoteObservers(prepared.stops);
    const hadTerminalError = prepared.pendingErrors.length > 0;
    for (const error of prepared.pendingErrors) {
      this.#handleTerminalPageError(
        error,
        generation,
        prepared.epoch,
      );
    }
    if (
      this.#activeObserverEpoch === prepared.epoch &&
      prepared.matchedPages.size === prepared.expectedPageCount
    ) {
      this.#markObserverSetHealthy();
    }
    if (
      prepared.pendingMismatch &&
      this.#activeObserverEpoch === prepared.epoch
    ) {
      this.#scheduleRefresh(generation);
    }
    return hadTerminalError;
  }

  #stopPreparedObservers(prepared: PreparedPageObservers): void {
    if (prepared.phase !== 'preparing') {
      return;
    }
    prepared.phase = 'stopped';
    this.#preparedPageObserverSets.delete(prepared);
    for (const stop of prepared.stops) {
      try {
        stop();
      } catch {
        // A never-activated observer has no durable state to roll back.
      }
    }
  }

  #addPreparedObserver(
    prepared: PreparedPageObservers,
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
    for (const prepared of [...this.#preparedPageObserverSets]) {
      this.#stopPreparedObservers(prepared);
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
      .catch(error => {
        if (this.#isActive(generation)) {
          const remoteError = normalizeRemoteError(error);
          this.#deliverRemoteError(remoteError);
          this.#setState({loadMoreError: LOAD_MORE_ERROR_MESSAGE});
          if (shouldAutoRecover(remoteError)) {
            this.#installHeadRecoveryObserver(generation);
          }
        }
      })
      .finally(() => {
        this.#refreshScheduled = false;
        if (this.#refreshAgain && this.#isActive(generation)) {
          this.#refreshAgain = false;
          this.#scheduleRefresh(generation);
        }
      });
  }

  #replaceRemoteObservers(stops: readonly (() => void)[]): void {
    const previous = this.#stopRemotePages;
    this.#stopRemotePages = stops;
    for (const stop of previous) {
      try {
        stop();
      } catch {
        // Observer cleanup cannot make a durable prefix replacement fail.
      }
    }
  }

  #handleTerminalPageError(
    error: CareEventRemoteError,
    generation: number,
    observerEpoch: number,
  ): void {
    if (
      this.#activeObserverEpoch !== observerEpoch ||
      !this.#isActive(generation)
    ) {
      return;
    }
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

  #markObserverSetHealthy(): void {
    this.#terminalRecoveryAttempts = 0;
    this.#recoveryRebindAttempts = 0;
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
      RECOVERY_RETRY_DELAY_MS * 2 ** exponent,
      MAX_RECOVERY_RETRY_DELAY_MS,
    );
    this.#recoveryRebindAttempts += 1;
    this.#recoveryRebindTimer = setTimeout(() => {
      this.#recoveryRebindTimer = undefined;
      if (this.#isActive(generation)) {
        this.#installHeadRecoveryObserver(generation);
      }
    }, delay);
  }

  #applyCoverageState(coverage: CareEventTimelineCoverage): void {
    this.#coverage = coverage;
    this.#coverageHydrated = true;
    const coveredIds = new Set(coverage.remoteEventIds);
    for (const id of this.#optimisticEventIds) {
      if (
        coveredIds.has(id as CareEvent['id']) ||
        this.#syncStates.get(id)?.status === 'synced' ||
        this.#syncStates.get(id) === undefined
      ) {
        this.#optimisticEventIds.delete(id);
      }
    }
    const capped =
      coverage.loadedRawCount > this.#options.maxCachedEvents ||
      (coverage.loadedRawCount >= this.#options.maxCachedEvents &&
        coverage.hasMore);
    this.#setState({
      events: this.#visibleEvents(),
      hasMore: coverage.hasMore && !capped,
      capped,
      loadMoreError: undefined,
    });
  }

  #visibleEvents(): readonly CareEvent[] {
    if (!this.#coverageHydrated || !this.#syncStatesHydrated) {
      return this.#allLocalEvents.slice(0, this.#options.maxCachedEvents);
    }
    const coveredIds = new Set(
      this.#coverage.remoteEventIds.slice(0, this.#options.maxCachedEvents),
    );
    return this.#allLocalEvents.filter(event => {
      if (
        coveredIds.has(event.id) ||
        this.#optimisticEventIds.has(event.id) ||
        (this.#syncStates.has(event.id) &&
          this.#syncStates.get(event.id)?.status !== 'synced')
      ) {
        return true;
      }
      return false;
    });
  }

  #setState(
    patch: Partial<CareEventTimelineFeedState>,
  ): void {
    this.#state = {...this.#state, ...patch};
    for (const listener of this.#listeners) {
      try {
        listener(this.#state);
      } catch {
        // Presentation listeners do not control timeline durability.
      }
    }
  }

  #reportRemoteError(error: unknown): void {
    this.#deliverRemoteError(normalizeRemoteError(error));
  }

  #deliverRemoteError(error: CareEventRemoteError): void {
    try {
      this.#options.onRemoteError?.(error);
    } catch {
      // Error reporting cannot corrupt a durable page transition.
    }
  }

  #assertStarted(): void {
    if (this.#closed) {
      throw new Error('Care event timeline feed is closed');
    }
    if (!this.#started) {
      throw new Error('Care event timeline feed must be started first');
    }
  }

  #isActive(generation: number): boolean {
    return (
      !this.#closed &&
      this.#started &&
      this.#lifecycleGeneration === generation
    );
  }
}
