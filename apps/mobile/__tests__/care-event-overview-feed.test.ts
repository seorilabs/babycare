import {
  babyId,
  careEventCursorFromEvent,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type ActiveSleepObservation,
  type CareEvent,
  type CareEventKind,
  type CareEventRemoteError,
  type CareEventWindowObservation,
  type CareEventWindowRequest,
  type EventId,
  type GroupId,
  type LatestCareEventObservation,
  type LatestCareEventRequest,
  type SleepEvent,
  type StringStoragePort,
} from '@babycare/product-core';
import {
  careEventMutationId,
  CareEventOverviewFeed,
  DEFAULT_CARE_EVENT_OVERVIEW_LOOKBACK_MS,
  PersistentCareEventSyncStore,
  type CareEventOverviewFeedState,
  type CareEventOverviewRemotePort,
  type CareEventSyncScope,
  type CareEventTimelineCoverage,
} from '@babycare/product-data';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = 50 * DAY_MS;

const scope: CareEventSyncScope = {
  userId: userId('overview-user'),
  groupId: groupId('overview-group'),
  babyId: babyId('overview-baby'),
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

interface WindowObserverRecord {
  readonly type: 'window';
  readonly request: CareEventWindowRequest;
  readonly listener: (observation: CareEventWindowObservation) => void;
  active: boolean;
}

interface LatestObserverRecord {
  readonly type: 'latest';
  readonly request: LatestCareEventRequest;
  readonly listener: (observation: LatestCareEventObservation) => void;
  active: boolean;
}

interface ActiveObserverRecord {
  readonly type: 'active';
  readonly request: CareEventWindowRequest;
  readonly listener: (observation: ActiveSleepObservation) => void;
  active: boolean;
}

type ObserverRecord =
  | WindowObserverRecord
  | LatestObserverRecord
  | ActiveObserverRecord;

class ProjectionRemote implements CareEventOverviewRemotePort {
  windowEvents: CareEvent[] = [];
  readonly latestEvents = new Map<CareEventKind, CareEvent | undefined>();
  activeSleep: SleepEvent | undefined;
  readonly eventsById = new Map<EventId, CareEvent>();

  readonly fetchWindowRequests: CareEventWindowRequest[] = [];
  readonly fetchLatestRequests: LatestCareEventRequest[] = [];
  readonly fetchActiveRequests: CareEventWindowRequest[] = [];
  readonly findByIdRequests: Array<{
    readonly groupId: GroupId;
    readonly eventId: EventId;
  }> = [];
  readonly observerHistory: ObserverRecord[] = [];
  synchronousWindowObservation: CareEventWindowObservation | undefined;

  #nextWindowFetch:
    | ((events: readonly CareEvent[]) => Promise<readonly CareEvent[]>)
    | undefined;

  fetchWindow(
    request: CareEventWindowRequest,
  ): Promise<readonly CareEvent[]> {
    this.fetchWindowRequests.push(request);
    const events = [...this.windowEvents];
    const handler = this.#nextWindowFetch;
    this.#nextWindowFetch = undefined;
    return handler ? handler(events) : Promise.resolve(events);
  }

  observeWindow(
    request: CareEventWindowRequest,
    listener: (observation: CareEventWindowObservation) => void,
  ): () => void {
    const observer: WindowObserverRecord = {
      type: 'window',
      request,
      listener,
      active: true,
    };
    this.observerHistory.push(observer);
    if (this.synchronousWindowObservation) {
      listener(this.synchronousWindowObservation);
    }
    return () => {
      observer.active = false;
    };
  }

  fetchLatest(
    request: LatestCareEventRequest,
  ): Promise<CareEvent | undefined> {
    this.fetchLatestRequests.push(request);
    return Promise.resolve(this.latestEvents.get(request.kind));
  }

  observeLatest(
    request: LatestCareEventRequest,
    listener: (observation: LatestCareEventObservation) => void,
  ): () => void {
    const observer: LatestObserverRecord = {
      type: 'latest',
      request,
      listener,
      active: true,
    };
    this.observerHistory.push(observer);
    return () => {
      observer.active = false;
    };
  }

  fetchActiveSleep(
    request: CareEventWindowRequest,
  ): Promise<SleepEvent | undefined> {
    this.fetchActiveRequests.push(request);
    return Promise.resolve(this.activeSleep);
  }

  observeActiveSleep(
    request: CareEventWindowRequest,
    listener: (observation: ActiveSleepObservation) => void,
  ): () => void {
    const observer: ActiveObserverRecord = {
      type: 'active',
      request,
      listener,
      active: true,
    };
    this.observerHistory.push(observer);
    return () => {
      observer.active = false;
    };
  }

  async findById(
    group: GroupId,
    id: EventId,
  ): Promise<CareEvent | undefined> {
    this.findByIdRequests.push({groupId: group, eventId: id});
    return this.eventsById.get(id);
  }

  get activeObservers(): readonly ObserverRecord[] {
    return this.observerHistory.filter(observer => observer.active);
  }

  failNextWindowFetch(error: unknown): void {
    this.#nextWindowFetch = async () => {
      throw error;
    };
  }

  deferNextWindowFetch(): {readonly release: () => void} {
    let release: (() => void) | undefined;
    this.#nextWindowFetch = events =>
      new Promise<readonly CareEvent[]>(resolve => {
        release = () => resolve(events);
      });
    return {release: () => release?.()};
  }

  latestActiveWindowObserver(): WindowObserverRecord {
    const observer = [...this.observerHistory]
      .reverse()
      .find(
        (candidate): candidate is WindowObserverRecord =>
          candidate.type === 'window' && candidate.active,
      );
    if (!observer) {
      throw new Error('No active window observer');
    }
    return observer;
  }
}

interface FeedHarness {
  readonly local: PersistentCareEventSyncStore;
  readonly remote: ProjectionRemote;
  readonly feed: CareEventOverviewFeed;
  readonly states: CareEventOverviewFeedState[];
  latest(): CareEventOverviewFeedState;
}

const activeHarnesses: FeedHarness[] = [];

function diaperAt(
  id: string,
  occurredAt: number,
  eventScope: CareEventSyncScope = scope,
): CareEvent {
  return createCareEvent(
    {
      groupId: eventScope.groupId,
      babyId: eventScope.babyId,
      caregiverId: eventScope.userId,
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt,
    },
    {id: eventId(id), now: occurredAt + 1_000},
  );
}

function feedingAt(id: string, occurredAt: number): CareEvent {
  return createCareEvent(
    {
      ...scope,
      caregiverId: scope.userId,
      kind: 'feeding',
      feedingType: 'formula',
      volumeMl: 120,
      occurredAt,
    },
    {id: eventId(id), now: occurredAt + 1_000},
  );
}

function activeSleepAt(id: string, startedAt: number): SleepEvent {
  return createCareEvent(
    {
      ...scope,
      caregiverId: scope.userId,
      kind: 'sleep',
      sleepType: 'night',
      startedAt,
    },
    {id: eventId(id), now: startedAt + 1_000},
  ) as SleepEvent;
}

function endedSleepAt(id: string, startedAt: number): SleepEvent {
  const active = activeSleepAt(id, startedAt);
  const endedAt = startedAt + 60 * 60 * 1_000;
  return {
    ...active,
    endedAt,
    updatedAt: endedAt,
    revision: active.revision + 1,
  };
}

function endSleep(event: SleepEvent, endedAt: number): SleepEvent {
  return {
    ...event,
    endedAt,
    updatedAt: endedAt,
    revision: event.revision + 1,
  };
}

function deleteSleep(event: SleepEvent, deletedAt: number): SleepEvent {
  return {
    ...event,
    deletedAt,
    updatedAt: deletedAt,
    revision: event.revision + 1,
  };
}

function coverageFor(events: readonly CareEvent[]): CareEventTimelineCoverage {
  const last = events.at(-1);
  return {
    remoteEventIds: events.map(event => event.id),
    ...(last ? {endCursor: careEventCursorFromEvent(last)} : {}),
    hasMore: false,
    loadedRawCount: events.length,
  };
}

function ids(events: readonly CareEvent[]): readonly string[] {
  return events.map(event => event.id);
}

function remoteFailure(
  message: string,
  code: CareEventRemoteError['code'] = 'retryable',
): Error {
  return Object.assign(new Error(message), {
    remoteError: {code},
  });
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

function createHarness(
  local: PersistentCareEventSyncStore,
  remote = new ProjectionRemote(),
  onRemoteError?: (error: CareEventRemoteError) => void,
  onServerConfirmed?: () => void | Promise<void>,
  recoveryRetryDelayMs?: number,
): FeedHarness {
  const states: CareEventOverviewFeedState[] = [];
  const feed = new CareEventOverviewFeed(local, remote, {
    groupId: scope.groupId,
    babyId: scope.babyId,
    clock: {now: () => NOW},
    ...(onRemoteError ? {onRemoteError} : {}),
    ...(onServerConfirmed ? {onServerConfirmed} : {}),
    ...(recoveryRetryDelayMs ? {recoveryRetryDelayMs} : {}),
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
  return harness;
}

async function startFreshHarness(
  remote = new ProjectionRemote(),
  onRemoteError?: (error: CareEventRemoteError) => void,
): Promise<FeedHarness> {
  const harness = createHarness(
    new PersistentCareEventSyncStore(scope, new MemoryStringStorage()),
    remote,
    onRemoteError,
  );
  await waitUntil(
    () => harness.latest().status === 'server_confirmed',
    'server-confirmed overview',
  );
  return harness;
}

afterEach(async () => {
  for (const harness of activeHarnesses.splice(0)) {
    harness.feed.close();
    await harness.local.close();
  }
});

describe('CareEventOverviewFeed', () => {
  it('does not start ownership after the initial listener closes the feed', async () => {
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const remote = new ProjectionRemote();
    const feed = new CareEventOverviewFeed(local, remote, {
      groupId: scope.groupId,
      babyId: scope.babyId,
      clock: {now: () => NOW},
    });

    feed.start(() => feed.close());
    await new Promise<void>(resolve => setTimeout(resolve, 10));

    expect(remote.fetchWindowRequests).toHaveLength(0);
    expect(remote.activeObservers).toHaveLength(0);
    await local.close();
  });

  it('tears down installed observers when server-state delivery closes the feed', async () => {
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const remote = new ProjectionRemote();
    const feed = new CareEventOverviewFeed(local, remote, {
      groupId: scope.groupId,
      babyId: scope.babyId,
      clock: {now: () => NOW},
    });
    let closedFromServerState = false;

    feed.start(state => {
      if (state.status === 'server_confirmed') {
        closedFromServerState = true;
        feed.close();
      }
    });
    await waitUntil(
      () => closedFromServerState,
      'server-state reentrant close',
    );

    expect(remote.activeObservers).toHaveLength(0);
    await local.close();
  });

  it('exposes only the overview window, latest kinds, active singleton, and optimistic overlays', async () => {
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const timelineOnly = diaperAt('timeline-only', NOW - 40 * DAY_MS);
    await local.replaceRemoteTimelinePrefix(
      [timelineOnly],
      coverageFor([timelineOnly]),
    );
    const pending = diaperAt('pending-overlay', NOW - 38 * DAY_MS);
    const failed = diaperAt('failed-overlay', NOW - 39 * DAY_MS);
    await local.saveAndEnqueue(pending);
    await local.saveAndEnqueue(failed);
    await local.markAttemptStarted(careEventMutationId(failed));
    await local.markFailed(careEventMutationId(failed), 'retryable');

    const remote = new ProjectionRemote();
    const windowDiaper = diaperAt('window-diaper', NOW - DAY_MS);
    const latestFeeding = feedingAt('latest-feeding', NOW - 35 * DAY_MS);
    const latestSleep = endedSleepAt('latest-sleep', NOW - 34 * DAY_MS);
    const activeSleep = activeSleepAt('active-singleton', NOW - 36 * DAY_MS);
    remote.windowEvents = [windowDiaper];
    remote.latestEvents.set('feeding', latestFeeding);
    remote.latestEvents.set('diaper', windowDiaper);
    remote.latestEvents.set('sleep', latestSleep);
    remote.activeSleep = activeSleep;

    const harness = createHarness(local, remote);
    await waitUntil(
      () => harness.latest().status === 'server_confirmed',
      'bounded overview composition',
    );

    expect(new Set(ids(harness.latest().events))).toEqual(
      new Set([
        windowDiaper.id,
        latestFeeding.id,
        latestSleep.id,
        activeSleep.id,
        pending.id,
        failed.id,
      ]),
    );
    expect(ids(harness.latest().events)).not.toContain(timelineOnly.id);
    expect(harness.latest().activeSleep).toEqual(activeSleep);
    await expect(local.findById(scope.groupId, timelineOnly.id)).resolves.toEqual(
      timelineOnly,
    );
    await expect(local.getSyncState(pending.id)).resolves.toMatchObject({
      status: 'pending',
    });
    await expect(local.getSyncState(failed.id)).resolves.toMatchObject({
      status: 'failed',
      failureKind: 'retryable',
    });

    expect(remote.fetchWindowRequests).toEqual([
      {
        groupId: scope.groupId,
        babyId: scope.babyId,
        from: NOW - DEFAULT_CARE_EVENT_OVERVIEW_LOOKBACK_MS,
      },
    ]);
    expect(remote.fetchLatestRequests.map(request => request.kind)).toEqual([
      'feeding',
      'diaper',
      'sleep',
    ]);
    expect(remote.fetchActiveRequests).toEqual(remote.fetchWindowRequests);
    expect(
      remote.observerHistory
        .filter(
          (observer): observer is LatestObserverRecord =>
            observer.type === 'latest',
        )
        .map(observer => observer.request.kind),
    ).toEqual(['feeding', 'diaper', 'sleep']);
  });

  it('restores an active singleton on a new device even outside the history window', async () => {
    const remote = new ProjectionRemote();
    const active = activeSleepAt('old-active-singleton', NOW - 40 * DAY_MS);
    remote.activeSleep = active;

    const harness = await startFreshHarness(remote);

    expect(harness.latest().activeSleep).toEqual(active);
    expect(ids(harness.latest().events)).toEqual([active.id]);
    expect(active.occurredAt).toBeLessThan(
      remote.fetchWindowRequests[0]!.from,
    );
    await expect(harness.local.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'active', eventId: active.id},
    });
  });

  it.each([
    {
      label: 'server none with an ended previous sleep',
      nextActive: undefined,
      reconcile: (previous: SleepEvent) =>
        endSleep(previous, previous.startedAt + 2 * 60 * 60 * 1_000),
    },
    {
      label: 'a new server active with a deleted previous sleep',
      nextActive: activeSleepAt('replacement-active', NOW - 2 * DAY_MS),
      reconcile: (previous: SleepEvent) =>
        deleteSleep(previous, previous.updatedAt + 1_000),
    },
  ])('reconciles $label through server-only findById', async scenario => {
    const storage = new MemoryStringStorage();
    const previous = activeSleepAt('previous-active', NOW - 3 * DAY_MS);
    const seed = new PersistentCareEventSyncStore(scope, storage);
    await seed.replaceRemoteActiveSleep(previous);
    await seed.close();

    const reconciled = scenario.reconcile(previous);
    const remote = new ProjectionRemote();
    remote.activeSleep = scenario.nextActive;
    remote.eventsById.set(previous.id, reconciled);
    const local = new PersistentCareEventSyncStore(scope, storage);
    const harness = createHarness(local, remote);
    await waitUntil(
      () => harness.latest().status === 'server_confirmed',
      `reconciliation for ${scenario.label}`,
    );

    expect(remote.findByIdRequests).toEqual([
      {groupId: scope.groupId, eventId: previous.id},
    ]);
    await expect(local.findById(scope.groupId, previous.id)).resolves.toEqual(
      reconciled,
    );
    expect(harness.latest().activeSleep).toEqual(scenario.nextActive);
    expect(ids(harness.latest().events)).toEqual(
      scenario.nextActive ? [scenario.nextActive.id] : [],
    );
  });

  it('keeps the last good active projection when its previous event is missing remotely', async () => {
    const storage = new MemoryStringStorage();
    const previous = activeSleepAt('missing-previous-active', NOW - DAY_MS);
    const seed = new PersistentCareEventSyncStore(scope, storage);
    await seed.replaceRemoteActiveSleep(previous);
    await seed.close();

    const remote = new ProjectionRemote();
    const onRemoteError = jest.fn();
    const local = new PersistentCareEventSyncStore(scope, storage);
    const harness = createHarness(local, remote, onRemoteError);
    await waitUntil(
      () => harness.latest().status === 'error',
      'missing previous active contract failure',
    );

    expect(harness.latest().activeSleep).toEqual(previous);
    expect(harness.latest().error).toMatchObject({code: 'invalid'});
    await expect(local.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'active', eventId: previous.id},
    });
    expect(onRemoteError).toHaveBeenCalledWith(
      expect.objectContaining({code: 'invalid'}),
    );
  });

  it('rejects mixed reads that disagree on one active sleep revision', async () => {
    const active = activeSleepAt('mixed-active-revision', NOW - DAY_MS);
    const ended = endSleep(active, active.startedAt + 60 * 60 * 1_000);
    const remote = new ProjectionRemote();
    remote.windowEvents = [ended];
    remote.latestEvents.set('sleep', ended);
    remote.activeSleep = active;
    const harness = createHarness(
      new PersistentCareEventSyncStore(scope, new MemoryStringStorage()),
      remote,
    );
    await waitUntil(
      () => harness.latest().status === 'error',
      'mixed active revision rejection',
    );

    expect(harness.latest().error).toMatchObject({code: 'invalid'});
    expect(harness.latest().events).toEqual([]);
    await expect(harness.local.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'unknown'},
    });
  });

  it('emits loading, cached, error, and server-confirmed while preserving the last good projection', async () => {
    const storage = new MemoryStringStorage();
    const cached = diaperAt('cached-last-good', NOW - 2 * DAY_MS);
    const seed = new PersistentCareEventSyncStore(scope, storage);
    await seed.replaceRemoteOverview([cached]);
    await seed.replaceRemoteActiveSleep(undefined);
    await seed.close();

    const remote = new ProjectionRemote();
    remote.failNextWindowFetch(remoteFailure('offline startup'));
    const onRemoteError = jest.fn();
    const harness = createHarness(
      new PersistentCareEventSyncStore(scope, storage),
      remote,
      onRemoteError,
    );
    await waitUntil(
      () =>
        harness.latest().status === 'error' &&
        remote.activeObservers.length === 1,
      'cached startup failure',
    );

    expect(harness.states.map(state => state.status)).toEqual(
      expect.arrayContaining(['loading', 'cached', 'error']),
    );
    expect(ids(harness.latest().events)).toEqual([cached.id]);
    expect(harness.latest().error).toMatchObject({code: 'retryable'});
    expect(onRemoteError).toHaveBeenCalledWith(
      expect.objectContaining({code: 'retryable'}),
    );

    const fresh = diaperAt('fresh-server-value', NOW - DAY_MS);
    remote.windowEvents = [fresh];
    remote.latestEvents.set('diaper', fresh);
    remote.latestActiveWindowObserver().listener({
      kind: 'server_value',
      events: [fresh],
    });
    await waitUntil(
      () =>
        harness.latest().status === 'server_confirmed' &&
        harness.latest().events[0]?.id === fresh.id,
      'recovered server projection',
    );

    expect(ids(harness.latest().events)).toEqual([fresh.id]);
    expect(harness.latest().error).toBeUndefined();
    expect(harness.states.map(state => state.status)).toContain(
      'server_confirmed',
    );
  });

  it('reports one error and rejects a failed public refresh', async () => {
    const remote = new ProjectionRemote();
    const onRemoteError = jest.fn();
    const harness = await startFreshHarness(remote, onRemoteError);
    remote.failNextWindowFetch(remoteFailure('manual refresh offline'));

    await expect(harness.feed.refresh()).rejects.toThrow(
      'manual refresh offline',
    );

    expect(harness.latest().status).toBe('error');
    expect(harness.latest().error).toMatchObject({code: 'retryable'});
    expect(onRemoteError).toHaveBeenCalledTimes(1);
  });

  it('refreshes every source on mismatch and ignores callbacks from old epochs or after close', async () => {
    const remote = new ProjectionRemote();
    const initial = diaperAt('initial-window', NOW - 2 * DAY_MS);
    remote.windowEvents = [initial];
    remote.latestEvents.set('diaper', initial);
    const onRemoteError = jest.fn();
    const harness = await startFreshHarness(remote, onRemoteError);
    const oldEpoch = [...remote.activeObservers];
    expect(oldEpoch).toHaveLength(5);
    const initialFetchCounts = {
      window: remote.fetchWindowRequests.length,
      latest: remote.fetchLatestRequests.length,
      active: remote.fetchActiveRequests.length,
    };

    const inserted = diaperAt('inserted-window', NOW - DAY_MS);
    remote.windowEvents = [inserted, initial];
    remote.latestEvents.set('diaper', inserted);
    const oldWindow = oldEpoch.find(
      (observer): observer is WindowObserverRecord =>
        observer.type === 'window',
    )!;
    oldWindow.listener({
      kind: 'server_value',
      events: [inserted, initial],
    });
    await waitUntil(
      () => harness.latest().events[0]?.id === inserted.id,
      'full projection refresh after observer mismatch',
    );

    expect(remote.fetchWindowRequests).toHaveLength(
      initialFetchCounts.window + 1,
    );
    expect(remote.fetchLatestRequests).toHaveLength(
      initialFetchCounts.latest + 3,
    );
    expect(remote.fetchActiveRequests).toHaveLength(
      initialFetchCounts.active + 1,
    );
    expect(oldEpoch.every(observer => !observer.active)).toBe(true);
    expect(remote.activeObservers).toHaveLength(5);

    const stableFetchCount = remote.fetchWindowRequests.length;
    oldWindow.listener({
      kind: 'error',
      error: {code: 'retryable', cause: new Error('stale epoch')},
    });
    oldWindow.listener({kind: 'server_value', events: [initial]});
    await new Promise<void>(resolve => setTimeout(resolve, 20));
    expect(remote.fetchWindowRequests).toHaveLength(stableFetchCount);
    expect(onRemoteError).not.toHaveBeenCalled();

    const currentWindow = remote.latestActiveWindowObserver();
    const stateCountAtClose = harness.states.length;
    harness.feed.close();
    expect(remote.activeObservers).toHaveLength(0);
    expect(currentWindow.active).toBe(false);
    currentWindow.listener({
      kind: 'error',
      error: {code: 'retryable', cause: new Error('after close')},
    });
    currentWindow.listener({kind: 'server_value', events: [initial]});
    await new Promise<void>(resolve => setTimeout(resolve, 20));
    expect(remote.fetchWindowRequests).toHaveLength(stableFetchCount);
    expect(harness.states).toHaveLength(stateCountAtClose);
    expect(onRemoteError).not.toHaveBeenCalled();
  });

  it('does not revive prepared observers superseded during the durable commit', async () => {
    const remote = new ProjectionRemote();
    const onServerConfirmed = jest.fn();
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const harness = createHarness(
      local,
      remote,
      undefined,
      onServerConfirmed,
    );
    await waitUntil(
      () => harness.latest().status === 'server_confirmed',
      'initial observer epoch',
    );
    const oldWindow = remote.latestActiveWindowObserver();
    const historyBeforeRefresh = remote.observerHistory.length;
    let releaseCommit: (() => void) | undefined;
    let notifyCommitStarted: (() => void) | undefined;
    const commitStarted = new Promise<void>(resolve => {
      notifyCommitStarted = resolve;
    });
    const originalReplace = local.replaceRemoteProjections.bind(local);
    jest
      .spyOn(local, 'replaceRemoteProjections')
      .mockImplementationOnce(async (...args) => {
        notifyCommitStarted?.();
        await new Promise<void>(resolve => {
          releaseCommit = resolve;
        });
        return originalReplace(...args);
      });

    const refreshing = harness.feed.refresh();
    await commitStarted;
    const superseded = remote.observerHistory.slice(historyBeforeRefresh);
    expect(superseded).toHaveLength(5);
    oldWindow.listener({
      kind: 'error',
      error: {code: 'retryable', cause: new Error('old epoch failed')},
    });
    releaseCommit?.();
    await refreshing;
    await waitUntil(
      () =>
        remote.fetchWindowRequests.length >= 3 &&
        remote.activeObservers.length === 5,
      'replacement observer epoch',
    );

    expect(superseded.every(observer => !observer.active)).toBe(true);
    expect(remote.activeObservers).toHaveLength(5);
    expect(onServerConfirmed).toHaveBeenCalledTimes(2);
  });

  it('stops prepared observers immediately when closed during a durable commit', async () => {
    const remote = new ProjectionRemote();
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const harness = createHarness(local, remote);
    await waitUntil(
      () => harness.latest().status === 'server_confirmed',
      'initial observer ownership',
    );
    let releaseCommit: (() => void) | undefined;
    let notifyCommitStarted: (() => void) | undefined;
    const commitStarted = new Promise<void>(resolve => {
      notifyCommitStarted = resolve;
    });
    const originalReplace = local.replaceRemoteProjections.bind(local);
    jest
      .spyOn(local, 'replaceRemoteProjections')
      .mockImplementationOnce(async (...args) => {
        notifyCommitStarted?.();
        await new Promise<void>(resolve => {
          releaseCommit = resolve;
        });
        return originalReplace(...args);
      });

    const refreshing = harness.feed.refresh();
    await commitStarted;
    expect(remote.activeObservers).toHaveLength(10);

    harness.feed.close();
    expect(remote.activeObservers).toHaveLength(0);

    releaseCommit?.();
    await refreshing;
    expect(remote.activeObservers).toHaveLength(0);
  });

  it('keeps one recovery observer after retryable observer and fetch errors, then recovers on a server value', async () => {
    const remote = new ProjectionRemote();
    const initial = diaperAt('recovery-initial', NOW - 2 * DAY_MS);
    remote.windowEvents = [initial];
    remote.latestEvents.set('diaper', initial);
    const onRemoteError = jest.fn();
    const harness = await startFreshHarness(remote, onRemoteError);
    const failedObserver = remote.latestActiveWindowObserver();
    const replacement = diaperAt('recovery-replacement', NOW - DAY_MS);
    remote.windowEvents = [replacement, initial];
    remote.latestEvents.set('diaper', replacement);
    remote.failNextWindowFetch(remoteFailure('refresh remained offline'));
    const fetchCount = remote.fetchWindowRequests.length;

    failedObserver.listener({
      kind: 'error',
      error: {code: 'retryable', cause: new Error('observer disconnected')},
    });
    await waitUntil(
      () =>
        harness.latest().status === 'error' &&
        remote.fetchWindowRequests.length === fetchCount + 1 &&
        remote.activeObservers.length === 1,
      'single recovery observer after failed refresh',
    );

    expect(failedObserver.active).toBe(false);
    expect(remote.activeObservers[0]?.type).toBe('window');
    const stableFetchCount = remote.fetchWindowRequests.length;
    await new Promise<void>(resolve => setTimeout(resolve, 30));
    expect(remote.fetchWindowRequests).toHaveLength(stableFetchCount);

    const recoveryObserver = remote.latestActiveWindowObserver();
    recoveryObserver.listener({
      kind: 'server_value',
      events: [replacement, initial],
    });
    await waitUntil(
      () =>
        harness.latest().status === 'server_confirmed' &&
        harness.latest().events[0]?.id === replacement.id,
      'observer-driven retry recovery',
    );

    expect(recoveryObserver.active).toBe(false);
    expect(remote.activeObservers).toHaveLength(5);
    expect(onRemoteError).toHaveBeenCalledTimes(2);
    expect(onRemoteError).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({code: 'retryable'}),
    );
    expect(onRemoteError).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({code: 'retryable'}),
    );
  });

  it('does not tight-loop or publish confirmation when a new observer fails synchronously', async () => {
    const remote = new ProjectionRemote();
    remote.synchronousWindowObservation = {
      kind: 'error',
      error: {code: 'retryable', cause: new Error('immediate listener failure')},
    };
    const onServerConfirmed = jest.fn();
    const harness = createHarness(
      new PersistentCareEventSyncStore(scope, new MemoryStringStorage()),
      remote,
      undefined,
      onServerConfirmed,
    );
    await waitUntil(
      () =>
        harness.latest().status === 'error' &&
        remote.fetchWindowRequests.length === 2,
      'bounded synchronous listener recovery',
    );

    const stableFetchCount = remote.fetchWindowRequests.length;
    await new Promise<void>(resolve => setTimeout(resolve, 30));

    expect(remote.fetchWindowRequests).toHaveLength(stableFetchCount);
    expect(onServerConfirmed).not.toHaveBeenCalled();
    expect(remote.activeObservers).toHaveLength(0);
  });

  it('rebinds a terminal recovery observer with bounded backoff', async () => {
    const remote = new ProjectionRemote();
    remote.failNextWindowFetch(remoteFailure('initial recovery fetch failed'));
    const harness = createHarness(
      new PersistentCareEventSyncStore(scope, new MemoryStringStorage()),
      remote,
      undefined,
      undefined,
      1,
    );
    await waitUntil(
      () =>
        harness.latest().status === 'error' &&
        remote.activeObservers.length === 1,
      'initial recovery observer',
    );
    const failedRecovery = remote.latestActiveWindowObserver();
    const windowObserverCount = remote.observerHistory.filter(
      observer => observer.type === 'window',
    ).length;

    failedRecovery.listener({
      kind: 'error',
      error: {code: 'retryable', cause: new Error('recovery listener died')},
    });
    await waitUntil(
      () =>
        !failedRecovery.active &&
        remote.activeObservers.length === 1 &&
        remote.observerHistory.filter(observer => observer.type === 'window')
          .length > windowObserverCount,
      'backed-off recovery observer rebind',
    );

    const rebound = remote.latestActiveWindowObserver();
    expect(rebound).not.toBe(failedRecovery);
    rebound.listener({kind: 'server_value', events: []});
    await waitUntil(
      () => harness.latest().status === 'server_confirmed',
      'rebound recovery completion',
    );
    expect(remote.activeObservers).toHaveLength(5);
  });

  it('waits for lifecycle recovery after a permission-denied startup', async () => {
    const remote = new ProjectionRemote();
    remote.failNextWindowFetch(
      remoteFailure('membership must be restored', 'permission_denied'),
    );
    const onRemoteError = jest.fn();
    const harness = createHarness(
      new PersistentCareEventSyncStore(scope, new MemoryStringStorage()),
      remote,
      onRemoteError,
      undefined,
      1,
    );
    await waitUntil(
      () => harness.latest().status === 'error',
      'permission-denied projection state',
    );
    const stableFetchCount = remote.fetchWindowRequests.length;

    await new Promise<void>(resolve => setTimeout(resolve, 20));
    expect(remote.fetchWindowRequests).toHaveLength(stableFetchCount);
    expect(remote.activeObservers).toHaveLength(0);
    expect(onRemoteError).toHaveBeenCalledWith(
      expect.objectContaining({code: 'permission_denied'}),
    );

    await harness.feed.refresh();
    expect(harness.latest().status).toBe('server_confirmed');
    expect(remote.activeObservers).toHaveLength(5);
  });

  it('forgets an acknowledged overlay evicted before projection refresh completes', async () => {
    const local = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    const oldPending = diaperAt('evicted-acknowledged-overlay', NOW - 40 * DAY_MS);
    await local.saveAndEnqueue(oldPending);
    const remote = new ProjectionRemote();
    const harness = createHarness(local, remote);
    await waitUntil(
      () => harness.latest().status === 'server_confirmed',
      'initial optimistic overview',
    );
    expect(ids(harness.latest().events)).toContain(oldPending.id);

    const deferred = remote.deferNextWindowFetch();
    const refreshing = harness.feed.refresh();
    await waitUntil(
      () => remote.fetchWindowRequests.length === 2,
      'deferred projection refresh',
    );
    await local.markSynced(careEventMutationId(oldPending));
    await local.replaceRemoteTimelinePrefix([], coverageFor([]));
    deferred.release();
    await refreshing;

    await local.mergeRemoteEvents([oldPending]);
    await new Promise<void>(resolve => setTimeout(resolve, 20));

    expect(ids(harness.latest().events)).not.toContain(oldPending.id);
  });

  it.each([
    {
      label: 'out-of-scope',
      events: [
        diaperAt('wrong-scope', NOW - DAY_MS, {
          ...scope,
          babyId: babyId('different-baby'),
        }),
      ],
    },
    {
      label: 'oldest-first',
      events: [
        diaperAt('ordering-older', NOW - 2 * DAY_MS),
        diaperAt('ordering-newer', NOW - DAY_MS),
      ],
    },
  ])('rejects an invalid $label window without replacing local state', async scenario => {
    const remote = new ProjectionRemote();
    remote.windowEvents = scenario.events;
    const onRemoteError = jest.fn();
    const harness = createHarness(
      new PersistentCareEventSyncStore(scope, new MemoryStringStorage()),
      remote,
      onRemoteError,
    );
    await waitUntil(
      () =>
        harness.latest().status === 'error' &&
        remote.activeObservers.length === 1,
      `invalid ${scenario.label} payload`,
    );

    expect(harness.latest().error).toMatchObject({code: 'invalid'});
    expect(onRemoteError).toHaveBeenCalledWith(
      expect.objectContaining({code: 'invalid'}),
    );
    expect(harness.latest().events).toEqual([]);
    await expect(harness.local.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'unknown'},
    });
    await expect(
      harness.local.list({...scope, includeDeleted: true}),
    ).resolves.toEqual([]);
  });
});
