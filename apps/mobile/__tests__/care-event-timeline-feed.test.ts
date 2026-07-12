import {
  babyId,
  careEventCursorFromEvent,
  createCareEvent,
  eventId,
  groupId,
  paginateCareEvents,
  userId,
  type CareEvent,
  type CareEventMutation,
  type CareEventPageRequest,
  type CareEventPushResult,
  type CareEventQuery,
  type CareEventRemoteObservation,
  type CareEventRemotePage,
  type CareEventRemotePageObservation,
  type CareEventRemoteStorePort,
  type EventId,
  type GroupId,
  type StringStoragePort,
} from '@babycare/product-core';
import {
  careEventMutationId,
  CareEventTimelineFeed,
  PersistentCareEventSyncStore,
  type CareEventSyncScope,
  type CareEventTimelineFeedConfig,
  type CareEventTimelineFeedOptions,
  type CareEventTimelineFeedState,
} from '@babycare/product-data';

const scope: CareEventSyncScope = {
  userId: userId('timeline-user'),
  groupId: groupId('timeline-group'),
  babyId: babyId('timeline-baby'),
};

class MemoryStringStorage implements StringStoragePort {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

interface DeferredFetch {
  readonly started: Promise<void>;
  release(): void;
}

interface PageObserverRecord {
  readonly request: CareEventPageRequest;
  readonly listener: (observation: CareEventRemotePageObservation) => void;
  active: boolean;
}

class TimelineRemoteStore implements CareEventRemoteStorePort {
  events: CareEvent[];
  readonly fetchRequests: CareEventPageRequest[] = [];
  readonly observerHistory: PageObserverRecord[] = [];
  readonly #pageObservers = new Set<PageObserverRecord>();
  #nextFetch:
    | ((page: CareEventRemotePage) => Promise<CareEventRemotePage>)
    | undefined;
  #observeInstallFailure:
    | {remainingSuccessfulInstalls: number; readonly error: Error}
    | undefined;

  constructor(events: readonly CareEvent[]) {
    this.events = [...events];
  }

  async push(mutation: CareEventMutation): Promise<CareEventPushResult> {
    return {kind: 'applied', remote: mutation.event};
  }

  async findById(
    group: GroupId,
    id: EventId,
  ): Promise<CareEvent | undefined> {
    return this.events.find(event => event.groupId === group && event.id === id);
  }

  fetchPage(request: CareEventPageRequest): Promise<CareEventRemotePage> {
    this.fetchRequests.push(request);
    const page = this.page(request);
    const handler = this.#nextFetch;
    this.#nextFetch = undefined;
    return handler ? handler(page) : Promise.resolve(page);
  }

  observePage(
    request: CareEventPageRequest,
    listener: (observation: CareEventRemotePageObservation) => void,
  ): () => void {
    const failure = this.#observeInstallFailure;
    if (failure) {
      if (failure.remainingSuccessfulInstalls === 0) {
        this.#observeInstallFailure = undefined;
        throw failure.error;
      }
      failure.remainingSuccessfulInstalls -= 1;
    }
    const observer: PageObserverRecord = {request, listener, active: true};
    this.observerHistory.push(observer);
    this.#pageObservers.add(observer);
    return () => {
      observer.active = false;
      this.#pageObservers.delete(observer);
    };
  }

  async list(query: CareEventQuery): Promise<readonly CareEvent[]> {
    return this.events.filter(
      event =>
        event.groupId === query.groupId &&
        event.babyId === query.babyId &&
        (query.includeDeleted || event.deletedAt === undefined),
    );
  }

  observe(
    _query: CareEventQuery,
    _listener: (observation: CareEventRemoteObservation) => void,
  ): () => void {
    return () => undefined;
  }

  get observerCount(): number {
    return this.#pageObservers.size;
  }

  emitObservedPages(): void {
    for (const observer of [...this.#pageObservers]) {
      observer.listener({
        kind: 'server_page',
        page: this.page(observer.request),
      });
    }
  }

  deferNextFetch(): DeferredFetch {
    let notifyStarted: (() => void) | undefined;
    let release: (() => void) | undefined;
    const started = new Promise<void>(resolve => {
      notifyStarted = resolve;
    });
    this.#nextFetch = page =>
      new Promise<CareEventRemotePage>(resolve => {
        release = () => resolve(page);
        notifyStarted?.();
      });
    return {
      started,
      release: () => release?.(),
    };
  }

  failNextFetch(error: unknown): void {
    this.#nextFetch = async () => {
      throw error;
    };
  }

  returnNextPage(page: CareEventRemotePage): void {
    this.#nextFetch = async () => page;
  }

  failObserveInstallAfter(
    successfulInstalls: number,
    error: Error,
  ): void {
    this.#observeInstallFailure = {
      remainingSuccessfulInstalls: successfulInstalls,
      error,
    };
  }

  pageFor(request: CareEventPageRequest): CareEventRemotePage {
    return this.page(request);
  }

  private page(request: CareEventPageRequest): CareEventRemotePage {
    const page = paginateCareEvents(this.events, request);
    const last = page.events.at(-1);
    return {
      events: page.events,
      ...(last ? {endCursor: careEventCursorFromEvent(last)} : {}),
      hasMore: page.hasMore,
    };
  }
}

interface FeedHarness {
  readonly local: PersistentCareEventSyncStore;
  readonly remote: TimelineRemoteStore;
  readonly feed: CareEventTimelineFeed;
  readonly states: CareEventTimelineFeedState[];
  latest(): CareEventTimelineFeedState;
}

const activeHarnesses: FeedHarness[] = [];

function diaper(
  id: string,
  occurredAt: number,
  deleted = false,
): CareEvent {
  const event = createCareEvent(
    {
      groupId: scope.groupId,
      babyId: scope.babyId,
      caregiverId: scope.userId,
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt,
    },
    {id: eventId(id), now: occurredAt + 10_000},
  );
  if (!deleted) {
    return event;
  }
  const deletedAt = event.updatedAt + 1_000;
  return {...event, deletedAt, updatedAt: deletedAt, revision: 2};
}

function ids(events: readonly CareEvent[]): readonly string[] {
  return events.map(event => event.id);
}

async function waitUntil(
  predicate: () => boolean,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

async function startFeed(
  events: readonly CareEvent[],
  config: Partial<CareEventTimelineFeedConfig> = {},
  callbacks: Pick<
    CareEventTimelineFeedOptions,
    'onRemoteError' | 'onServerConfirmed'
  > = {},
): Promise<FeedHarness> {
  const local = new PersistentCareEventSyncStore(
    scope,
    new MemoryStringStorage(),
  );
  const remote = new TimelineRemoteStore(events);
  const states: CareEventTimelineFeedState[] = [];
  const feed = new CareEventTimelineFeed(local, remote, {
    groupId: scope.groupId,
    babyId: scope.babyId,
    pageSize: 2,
    maxCachedEvents: 8,
    maxScanPagesPerLoad: 3,
    ...config,
    ...callbacks,
  });
  const harness: FeedHarness = {
    local,
    remote,
    feed,
    states,
    latest: () => states.at(-1)!,
  };
  activeHarnesses.push(harness);
  feed.start(state => states.push(state));
  await waitUntil(
    () => remote.observerCount > 0 && remote.fetchRequests.length > 0,
    'initial timeline prefix',
  );
  return harness;
}

afterEach(async () => {
  for (const harness of activeHarnesses.splice(0)) {
    harness.feed.close();
    await harness.local.close();
  }
});

describe('CareEventTimelineFeed', () => {
  it('rebases the complete loaded prefix from HEAD after a head insertion', async () => {
    const initial = [
      diaper('event-5', 5_000),
      diaper('event-4', 4_000),
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
    ];
    const harness = await startFeed(initial);
    await harness.feed.loadMore();
    expect(ids(harness.latest().events)).toEqual(ids(initial));

    const inserted = diaper('event-6', 6_000);
    harness.remote.events = [inserted, ...initial];
    const fetchCount = harness.remote.fetchRequests.length;
    harness.remote.emitObservedPages();

    await waitUntil(
      () => harness.latest().events[0]?.id === inserted.id,
      'head-insertion rebase',
    );
    expect(harness.remote.fetchRequests.length).toBeGreaterThan(fetchCount);
    expect(ids(harness.latest().events)).toEqual([
      inserted.id,
      initial[0]!.id,
      initial[1]!.id,
      initial[2]!.id,
    ]);
    expect(ids(await harness.local.list({...scope}))).toEqual(
      ids(harness.latest().events),
    );
  });

  it('paginates equal timestamps by document ID exactly once', async () => {
    const events = [
      diaper('same-a', 5_000),
      diaper('same-d', 5_000),
      diaper('same-b', 5_000),
      diaper('same-c', 5_000),
    ];
    const harness = await startFeed(events);

    expect(ids(harness.latest().events)).toEqual(['same-d', 'same-c']);
    await harness.feed.loadMore();

    expect(ids(harness.latest().events)).toEqual([
      'same-d',
      'same-c',
      'same-b',
      'same-a',
    ]);
    expect(new Set(ids(harness.latest().events)).size).toBe(4);
  });

  it('scans through tombstone-only pages until it finds another visible row', async () => {
    const visibleHead = [diaper('visible-6', 6_000), diaper('visible-5', 5_000)];
    const tombstones = [
      diaper('deleted-4', 4_000, true),
      diaper('deleted-3', 3_000, true),
    ];
    const visibleTail = diaper('visible-2', 2_000);
    const finalTombstone = diaper('deleted-1', 1_000, true);
    const harness = await startFeed([
      ...visibleHead,
      ...tombstones,
      visibleTail,
      finalTombstone,
    ]);

    await harness.feed.loadMore();

    expect(ids(harness.latest().events)).toEqual([
      visibleHead[0]!.id,
      visibleHead[1]!.id,
      visibleTail.id,
    ]);
    const coverage = await harness.local.getTimelineCoverage();
    expect(coverage.loadedRawCount).toBe(6);
    expect(coverage.remoteEventIds).toEqual([
      visibleHead[0]!.id,
      visibleHead[1]!.id,
      tombstones[0]!.id,
      tombstones[1]!.id,
      visibleTail.id,
      finalTombstone.id,
    ]);
  });

  it('returns one in-flight promise for duplicate loadMore calls', async () => {
    const harness = await startFeed([
      diaper('event-4', 4_000),
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
      diaper('event-1', 1_000),
    ]);
    const deferred = harness.remote.deferNextFetch();
    const fetchCount = harness.remote.fetchRequests.length;

    const first = harness.feed.loadMore();
    const duplicate = harness.feed.loadMore();

    expect(duplicate).toBe(first);
    expect(harness.latest().loadingMore).toBe(true);
    await deferred.started;
    expect(harness.remote.fetchRequests).toHaveLength(fetchCount + 1);
    deferred.release();
    await first;

    expect(harness.latest().loadingMore).toBe(false);
    expect(ids(harness.latest().events)).toHaveLength(4);
  });

  it('surfaces a load error and clears it after an explicit retry', async () => {
    const remoteErrors = jest.fn();
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const remote = new TimelineRemoteStore([
      diaper('event-4', 4_000),
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
      diaper('event-1', 1_000),
    ]);
    const states: CareEventTimelineFeedState[] = [];
    const feed = new CareEventTimelineFeed(local, remote, {
      groupId: scope.groupId,
      babyId: scope.babyId,
      pageSize: 2,
      maxCachedEvents: 8,
      maxScanPagesPerLoad: 3,
      onRemoteError: remoteErrors,
    });
    const harness: FeedHarness = {
      local,
      remote,
      feed,
      states,
      latest: () => states.at(-1)!,
    };
    activeHarnesses.push(harness);
    feed.start(state => states.push(state));
    await waitUntil(() => remote.observerCount > 0, 'initial error-test prefix');
    const failure = Object.assign(new Error('offline'), {
      remoteError: {code: 'retryable' as const},
    });
    remote.failNextFetch(failure);

    await expect(feed.loadMore()).rejects.toBe(failure);
    expect(harness.latest()).toMatchObject({
      loadingMore: false,
      loadMoreError: '이전 기록을 불러오지 못했어요.',
    });
    expect(remoteErrors).toHaveBeenCalledWith(
      expect.objectContaining({code: 'retryable'}),
    );

    await feed.retryLoadMore();
    expect(harness.latest().loadMoreError).toBeUndefined();
    expect(ids(harness.latest().events)).toHaveLength(4);
  });

  it('stops at the raw cache cap even when more server rows exist', async () => {
    const events = Array.from({length: 8}, (_, index) =>
      diaper(`event-${8 - index}`, (8 - index) * 1_000),
    );
    const harness = await startFeed(events, {maxCachedEvents: 4});

    await harness.feed.loadMore();

    expect(ids(harness.latest().events)).toHaveLength(4);
    expect(harness.latest()).toMatchObject({
      hasMore: false,
      capped: true,
    });
    expect((await harness.local.getTimelineCoverage()).loadedRawCount).toBe(4);
    const fetchCount = harness.remote.fetchRequests.length;
    await harness.feed.loadMore();
    expect(harness.remote.fetchRequests).toHaveLength(fetchCount);
  });

  it('ignores a stale fetch that resolves after close', async () => {
    const initial = [
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
      diaper('event-1', 1_000),
    ];
    const harness = await startFeed(initial);
    const inserted = diaper('event-4', 4_000);
    harness.remote.events = [inserted, ...initial];
    const deferred = harness.remote.deferNextFetch();
    const pending = harness.feed.loadMore();
    await deferred.started;
    const stateCountAtClose = harness.states.length;

    harness.feed.close();
    deferred.release();
    await pending;

    expect(harness.states).toHaveLength(stateCountAtClose);
    expect(ids(await harness.local.list({...scope}))).toEqual([
      initial[0]!.id,
      initial[1]!.id,
    ]);
    expect((await harness.local.getTimelineCoverage()).remoteEventIds).toEqual([
      initial[0]!.id,
      initial[1]!.id,
    ]);
    expect(() => harness.feed.loadMore()).toThrow(
      'Care event timeline feed is closed',
    );
  });

  it('removes an acknowledged backdated optimistic row after authoritative refresh', async () => {
    const remoteEvents = [
      diaper('remote-3', 3_000),
      diaper('remote-2', 2_000),
      diaper('remote-1', 1_000),
    ];
    const harness = await startFeed(remoteEvents);
    const backdated = diaper('local-backdated', 500);

    await harness.local.saveAndEnqueue(backdated);
    await waitUntil(
      () => ids(harness.latest().events).includes(backdated.id),
      'optimistic backdated row',
    );
    expect(
      (await harness.local.getTimelineCoverage()).remoteEventIds,
    ).not.toContain(backdated.id);

    harness.remote.events = [...remoteEvents, backdated];
    const fetchCount = harness.remote.fetchRequests.length;
    await harness.local.markSynced(careEventMutationId(backdated));

    await waitUntil(
      () =>
        harness.remote.fetchRequests.length > fetchCount &&
        !ids(harness.latest().events).includes(backdated.id),
      'authoritative removal of acknowledged backdated row',
    );
    expect(
      (await harness.local.getTimelineCoverage()).remoteEventIds,
    ).not.toContain(backdated.id);
  });

  it('ignores late snapshots and errors from an observer replaced by rebind', async () => {
    const remoteErrors = jest.fn();
    const initial = [
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
      diaper('event-1', 1_000),
    ];
    const harness = await startFeed(initial, {}, {onRemoteError: remoteErrors});
    const oldObserver = harness.remote.observerHistory.at(-1)!;

    await harness.feed.refresh();
    const currentObserver = harness.remote.observerHistory.at(-1)!;
    expect(currentObserver).not.toBe(oldObserver);
    expect(oldObserver.active).toBe(false);
    expect(currentObserver.active).toBe(true);

    const inserted = diaper('event-4', 4_000);
    harness.remote.events = [inserted, ...initial];
    const fetchCount = harness.remote.fetchRequests.length;
    oldObserver.listener({
      kind: 'error',
      error: {code: 'retryable', cause: new Error('late error')},
    });
    oldObserver.listener({
      kind: 'server_page',
      page: harness.remote.pageFor(oldObserver.request),
    });
    await new Promise<void>(resolve => setTimeout(resolve, 10));

    expect(remoteErrors).not.toHaveBeenCalled();
    expect(harness.remote.fetchRequests).toHaveLength(fetchCount);
    expect(ids(harness.latest().events)).not.toContain(inserted.id);

    currentObserver.listener({
      kind: 'server_page',
      page: harness.remote.pageFor(currentObserver.request),
    });
    await waitUntil(
      () => harness.latest().events[0]?.id === inserted.id,
      'current observer refresh',
    );
  });

  it('rebinds all pages after a terminal retryable observer error', async () => {
    const remoteErrors = jest.fn();
    const initial = [
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
      diaper('event-1', 1_000),
    ];
    const harness = await startFeed(initial, {}, {onRemoteError: remoteErrors});
    const failedObserver = harness.remote.observerHistory.at(-1)!;
    const inserted = diaper('event-4', 4_000);
    harness.remote.events = [inserted, ...initial];
    const fetchCount = harness.remote.fetchRequests.length;

    failedObserver.listener({
      kind: 'error',
      error: {code: 'retryable', cause: new Error('listener terminated')},
    });

    await waitUntil(
      () =>
        harness.remote.fetchRequests.length > fetchCount &&
        harness.latest().events[0]?.id === inserted.id,
      'retryable observer rebind',
    );
    expect(failedObserver.active).toBe(false);
    expect(harness.remote.observerCount).toBeGreaterThan(0);
    expect(remoteErrors).toHaveBeenCalledWith(
      expect.objectContaining({code: 'retryable'}),
    );
  });

  it('keeps the old observer and prefix when preparing a replacement observer throws', async () => {
    const initial = [
      diaper('event-4', 4_000),
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
      diaper('event-1', 1_000),
    ];
    const harness = await startFeed(initial);
    const oldObserver = harness.remote.observerHistory.at(-1)!;
    const oldCoverage = await harness.local.getTimelineCoverage();
    const installError = new Error('observer install failed');
    harness.remote.failObserveInstallAfter(1, installError);

    await expect(harness.feed.loadMore()).rejects.toBe(installError);

    expect(await harness.local.getTimelineCoverage()).toEqual(oldCoverage);
    expect(ids(await harness.local.list({...scope}))).toEqual([
      initial[0]!.id,
      initial[1]!.id,
    ]);
    expect(harness.remote.observerCount).toBe(1);
    expect(oldObserver.active).toBe(true);
    expect(harness.remote.observerHistory.at(-1)!.active).toBe(false);

    const inserted = diaper('event-5', 5_000);
    harness.remote.events = [inserted, ...initial];
    oldObserver.listener({
      kind: 'server_page',
      page: harness.remote.pageFor(oldObserver.request),
    });
    await waitUntil(
      () => harness.latest().events[0]?.id === inserted.id,
      'old observer recovery refresh',
    );
  });

  it('classifies a malformed remote page as invalid', async () => {
    const remoteErrors = jest.fn();
    const initial = [
      diaper('event-4', 4_000),
      diaper('event-3', 3_000),
      diaper('event-2', 2_000),
      diaper('event-1', 1_000),
    ];
    const harness = await startFeed(initial, {}, {onRemoteError: remoteErrors});
    const malformedEvents = initial.slice(0, 3);
    harness.remote.returnNextPage({
      events: malformedEvents,
      endCursor: careEventCursorFromEvent(malformedEvents.at(-1)!),
      hasMore: true,
    });

    await expect(harness.feed.loadMore()).rejects.toThrow(
      'Remote timeline page exceeded the requested page size',
    );

    expect(remoteErrors).toHaveBeenCalledWith(
      expect.objectContaining({code: 'invalid'}),
    );
    expect(harness.latest().loadMoreError).toBe(
      '이전 기록을 불러오지 못했어요.',
    );
    expect((await harness.local.getTimelineCoverage()).loadedRawCount).toBe(2);
  });

  it('continues startup when the initial presentation listener throws', async () => {
    const initial = [diaper('event-2', 2_000), diaper('event-1', 1_000)];
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const remote = new TimelineRemoteStore(initial);
    const delivered: CareEventTimelineFeedState[] = [];
    let deliveryCount = 0;
    const feed = new CareEventTimelineFeed(local, remote, {
      groupId: scope.groupId,
      babyId: scope.babyId,
      pageSize: 2,
      maxCachedEvents: 8,
      maxScanPagesPerLoad: 3,
    });
    const harness: FeedHarness = {
      local,
      remote,
      feed,
      states: delivered,
      latest: () => delivered.at(-1)!,
    };
    activeHarnesses.push(harness);

    expect(() =>
      feed.start(state => {
        deliveryCount += 1;
        if (deliveryCount === 1) {
          throw new Error('presentation failed');
        }
        delivered.push(state);
      }),
    ).not.toThrow();
    await waitUntil(
      () =>
        remote.observerCount > 0 &&
        ids(delivered.at(-1)?.events ?? []).length === 2,
      'startup after presentation error',
    );

    expect(deliveryCount).toBeGreaterThan(1);
    expect(ids(delivered.at(-1)!.events)).toEqual(ids(initial));
  });

  it('recovers an offline startup from the HEAD observer without user retry', async () => {
    const initial = [diaper('event-2', 2_000), diaper('event-1', 1_000)];
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const remote = new TimelineRemoteStore(initial);
    const initialFailure = Object.assign(new Error('offline at startup'), {
      remoteError: {code: 'retryable' as const},
    });
    remote.failNextFetch(initialFailure);
    const remoteErrors = jest.fn();
    const onServerConfirmed = jest.fn(async () => undefined);
    const states: CareEventTimelineFeedState[] = [];
    const feed = new CareEventTimelineFeed(local, remote, {
      groupId: scope.groupId,
      babyId: scope.babyId,
      pageSize: 2,
      maxCachedEvents: 8,
      maxScanPagesPerLoad: 3,
      onRemoteError: remoteErrors,
      onServerConfirmed,
    });
    const harness: FeedHarness = {
      local,
      remote,
      feed,
      states,
      latest: () => states.at(-1)!,
    };
    activeHarnesses.push(harness);
    feed.start(state => states.push(state));

    await waitUntil(
      () =>
        harness.latest().loadMoreError ===
          '이전 기록을 불러오지 못했어요.' &&
        remote.observerCount === 1,
      'offline startup recovery observer',
    );
    expect(remoteErrors).toHaveBeenCalledWith(
      expect.objectContaining({code: 'retryable'}),
    );
    expect(onServerConfirmed).not.toHaveBeenCalled();
    const failedFetchCount = remote.fetchRequests.length;
    const recoveryObserver = remote.observerHistory.at(-1)!;

    recoveryObserver.listener({
      kind: 'server_page',
      page: remote.pageFor(recoveryObserver.request),
    });

    await waitUntil(
      () =>
        remote.fetchRequests.length > failedFetchCount &&
        harness.latest().loadMoreError === undefined &&
        ids(harness.latest().events).join(',') === ids(initial).join(',') &&
        onServerConfirmed.mock.calls.length === 1,
      'automatic HEAD recovery',
    );
    expect(recoveryObserver.active).toBe(false);
    expect(remote.observerHistory.at(-1)!.active).toBe(true);
  });

  it('never emits more than a reduced cache bound during offline v2 restart', async () => {
    const storage = new MemoryStringStorage();
    const persistedEvents = Array.from({length: 6}, (_, index) =>
      diaper(`persisted-${6 - index}`, (6 - index) * 1_000),
    );
    const previous = new PersistentCareEventSyncStore(scope, storage);
    await previous.replaceRemoteTimelinePrefix(persistedEvents, {
      remoteEventIds: persistedEvents.map(event => event.id),
      endCursor: careEventCursorFromEvent(persistedEvents.at(-1)!),
      hasMore: true,
      loadedRawCount: persistedEvents.length,
    });
    await previous.close();

    const local = new PersistentCareEventSyncStore(scope, storage);
    const remote = new TimelineRemoteStore(persistedEvents);
    remote.failNextFetch(
      Object.assign(new Error('still offline'), {
        remoteError: {code: 'retryable' as const},
      }),
    );
    const states: CareEventTimelineFeedState[] = [];
    const feed = new CareEventTimelineFeed(local, remote, {
      groupId: scope.groupId,
      babyId: scope.babyId,
      pageSize: 2,
      maxCachedEvents: 4,
      maxScanPagesPerLoad: 3,
    });
    const harness: FeedHarness = {
      local,
      remote,
      feed,
      states,
      latest: () => states.at(-1)!,
    };
    activeHarnesses.push(harness);
    feed.start(state => states.push(state));

    await waitUntil(
      () =>
        harness.latest().loadMoreError ===
          '이전 기록을 불러오지 못했어요.' &&
        remote.observerCount === 1,
      'bounded offline v2 restart',
    );

    expect(states.length).toBeGreaterThan(1);
    expect(states.every(state => state.events.length <= 4)).toBe(true);
    expect(Math.max(...states.map(state => state.events.length))).toBe(4);
    expect(
      await local.list({...scope, includeDeleted: true}),
    ).toHaveLength(6);
  });
});
