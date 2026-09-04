import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
  type CareEventMutation,
  type CareEventPushResult,
  type CareEventPageRequest,
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
  CareEventSyncHydrationError,
  LocalFirstCareEventRepository,
  PersistentCareEventSyncStore,
  type CareEventSyncScope,
} from '@babycare/product-data';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const getItem = AsyncStorage.getItem as jest.MockedFunction<
  typeof AsyncStorage.getItem
>;
const setItem = AsyncStorage.setItem as jest.MockedFunction<
  typeof AsyncStorage.setItem
>;
const removeItem = AsyncStorage.removeItem as jest.MockedFunction<
  typeof AsyncStorage.removeItem
>;

const scope: CareEventSyncScope = {
  userId: userId('user-1'),
  groupId: groupId('group-1'),
  babyId: babyId('baby-1'),
};

function diaper(
  id: string,
  diaperType: 'wet' | 'dirty' = 'wet',
): Extract<CareEvent, {kind: 'diaper'}> {
  return createCareEvent(
    {
      groupId: scope.groupId,
      babyId: scope.babyId,
      caregiverId: scope.userId,
      kind: 'diaper',
      diaperType,
      occurredAt: 1_000,
    },
    {id: eventId(id), now: 2_000},
  ) as Extract<CareEvent, {kind: 'diaper'}>;
}

function activeSleep(): Extract<CareEvent, {kind: 'sleep'}> {
  return createCareEvent(
    {
      groupId: scope.groupId,
      babyId: scope.babyId,
      caregiverId: scope.userId,
      kind: 'sleep',
      sleepType: 'night',
      startedAt: 1_000,
    },
    {id: eventId('sleep-1'), now: 2_000},
  ) as Extract<CareEvent, {kind: 'sleep'}>;
}

class ScriptedRemoteStore implements CareEventRemoteStorePort {
  readonly pushes: CareEventMutation[] = [];
  readonly queries: CareEventQuery[] = [];
  readonly #listeners = new Set<
    (observation: CareEventRemoteObservation) => void
  >();
  lastListener:
    | ((observation: CareEventRemoteObservation) => void)
    | undefined;
  pushHandler: (
    mutation: CareEventMutation,
  ) => Promise<CareEventPushResult> = async mutation => ({
    kind: 'applied',
    remote: mutation.event,
  });

  push(mutation: CareEventMutation): Promise<CareEventPushResult> {
    this.pushes.push(mutation);
    return this.pushHandler(mutation);
  }

  async findById(
    _groupId: GroupId,
    _eventId: EventId,
  ): Promise<CareEvent | undefined> {
    return undefined;
  }

  async fetchPage(
    _request: CareEventPageRequest,
  ): Promise<CareEventRemotePage> {
    return {events: [], hasMore: false};
  }

  observePage(
    _request: CareEventPageRequest,
    _listener: (observation: CareEventRemotePageObservation) => void,
  ): () => void {
    return () => undefined;
  }

  async list(_query: CareEventQuery): Promise<readonly CareEvent[]> {
    return [];
  }

  observe(
    query: CareEventQuery,
    listener: (observation: CareEventRemoteObservation) => void,
  ): () => void {
    this.queries.push(query);
    this.lastListener = listener;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  emit(observation: CareEventRemoteObservation): void {
    for (const listener of this.#listeners) {
      listener(observation);
    }
  }
}

describe('local-first care event synchronization', () => {
  let storage: Map<string, string>;
  let storagePort: StringStoragePort;
  let failNextWrite: boolean;

  beforeEach(() => {
    storage = new Map();
    failNextWrite = false;
    jest.clearAllMocks();
    getItem.mockImplementation(async key => storage.get(key) ?? null);
    setItem.mockImplementation(async (key, value) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('disk full');
      }
      storage.set(key, value);
    });
    removeItem.mockImplementation(async key => {
      storage.delete(key);
    });
    storagePort = {
      getItem: key => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: key => AsyncStorage.removeItem(key),
    };
  });

  it('returns after one durable local commit without awaiting the remote transaction', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    let resolvePush: ((result: CareEventPushResult) => void) | undefined;
    let notifyPushStarted: (() => void) | undefined;
    const pushStarted = new Promise<void>(resolve => {
      notifyPushStarted = resolve;
    });
    remote.pushHandler = _mutation =>
      new Promise(resolve => {
        resolvePush = resolve;
        notifyPushStarted?.();
      });
    const repository = new LocalFirstCareEventRepository(local, remote);
    const event = diaper('event-offline');

    await repository.save(event);
    await pushStarted;

    expect(await repository.list(scope)).toEqual([event]);
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'pending',
      pendingRevisions: [1],
    });
    expect(remote.pushes).toHaveLength(1);

    resolvePush?.({kind: 'applied', remote: event});
    await repository.syncNow();
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'synced',
      pendingRevisions: [],
    });
  });

  it('recovers a failed outbox from scoped storage and retries after restart', async () => {
    const firstLocal = new PersistentCareEventSyncStore(scope, storagePort);
    const firstRemote = new ScriptedRemoteStore();
    firstRemote.pushHandler = async () => {
      throw {remoteError: {code: 'retryable'}};
    };
    const firstRepository = new LocalFirstCareEventRepository(
      firstLocal,
      firstRemote,
    );
    const event = diaper('event-restart');
    await firstRepository.save(event);
    await firstRepository.syncNow();
    expect(await firstRepository.getSyncState(event.id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      failureKind: 'retryable',
    });

    await firstLocal.close();

    const restartedLocal = new PersistentCareEventSyncStore(
      scope,
      storagePort,
    );
    const restartedRemote = new ScriptedRemoteStore();
    const restartedRepository = new LocalFirstCareEventRepository(
      restartedLocal,
      restartedRemote,
    );
    await restartedRepository.syncNow({retryFailed: true});

    expect(restartedRemote.pushes.map(item => item.id)).toEqual([
      careEventMutationId(event),
    ]);
    expect(await restartedRepository.getSyncState(event.id)).toMatchObject({
      status: 'synced',
    });
  });

  it('keeps offline revisions and drains them in order without coalescing', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const started = activeSleep();
    const ended = {
      ...started,
      endedAt: 3_000,
      updatedAt: 3_000,
      revision: 2,
    } satisfies CareEvent;
    let resolveFirst: ((result: CareEventPushResult) => void) | undefined;
    remote.pushHandler = mutation => {
      if (mutation.event.revision === 1) {
        return new Promise(resolve => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({kind: 'applied', remote: mutation.event});
    };
    const repository = new LocalFirstCareEventRepository(local, remote);

    await repository.save(started);
    await Promise.resolve();
    await repository.save(ended);
    expect(await repository.getSyncState(started.id)).toMatchObject({
      pendingRevisions: [1, 2],
    });

    resolveFirst?.({kind: 'applied', remote: started});
    await repository.syncNow();
    expect(remote.pushes.map(item => item.event.revision)).toEqual([1, 2]);
    expect(remote.pushes.map(item => item.kind)).toEqual([
      'create',
      'end_sleep',
    ]);
  });

  it('rolls memory and observers back when the atomic envelope write fails', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const snapshots: (readonly CareEvent[])[] = [];
    local.observe(scope, events => snapshots.push(events));
    await Promise.resolve();
    failNextWrite = true;

    await expect(local.saveAndEnqueue(diaper('event-disk-fail'))).rejects.toThrow(
      'disk full',
    );

    expect(await local.list(scope)).toEqual([]);
    expect(snapshots.at(-1)).toEqual([]);
  });

  it('cancels a queued initial observer delivery after unsubscribe', async () => {
    let continueWrite: (() => void) | undefined;
    let notifyWriteStarted: (() => void) | undefined;
    const writeStarted = new Promise<void>(resolve => {
      notifyWriteStarted = resolve;
    });
    const writeCanFinish = new Promise<void>(resolve => {
      continueWrite = resolve;
    });
    setItem.mockImplementationOnce(async (key, value) => {
      notifyWriteStarted?.();
      await writeCanFinish;
      storage.set(key, value);
    });
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const saving = local.saveAndEnqueue(diaper('event-observer-queued'));
    await writeStarted;
    const listener = jest.fn();
    const stop = local.observe(scope, listener);

    stop();
    continueWrite?.();
    await saving;
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    await local.clear();
  });

  it('serializes concurrent local commits without losing either mutation', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    await Promise.all([
      local.saveAndEnqueue(diaper('event-a')),
      local.saveAndEnqueue(diaper('event-b')),
    ]);

    expect(await local.list(scope)).toHaveLength(2);
    const first = await local.nextPending();
    expect(first).toBeDefined();
    await local.markSynced(first!.id);
    expect(await local.nextPending()).toBeDefined();
  });

  it('rejects a second writer for the same storage scope until the first closes', async () => {
    const first = new PersistentCareEventSyncStore(scope, storagePort);

    expect(
      () => new PersistentCareEventSyncStore(scope, storagePort),
    ).toThrow('already active');

    await first.close();
    const reopened = new PersistentCareEventSyncStore(scope, storagePort);
    await expect(reopened.list(scope)).resolves.toEqual([]);
    await reopened.close();
  });

  it('upgrades a concurrent normal close to a privacy purge', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    await local.saveAndEnqueue(diaper('event-close-clear-race'));

    const closing = local.close();
    const clearing = local.clear();
    await Promise.all([closing, clearing]);

    expect(storage.size).toBe(0);
    const reopened = new PersistentCareEventSyncStore(scope, storagePort);
    await expect(reopened.list(scope)).resolves.toEqual([]);
    await reopened.close();
  });

  it('reclaims the writer before purging after a completed close', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    await local.saveAndEnqueue(diaper('event-close-then-clear'));
    await local.close();

    await local.clear();

    expect(storage.size).toBe(0);
    const reopened = new PersistentCareEventSyncStore(scope, storagePort);
    await expect(reopened.list(scope)).resolves.toEqual([]);
    await reopened.close();
  });

  it('joins concurrent purges that replace a completed close', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    await local.saveAndEnqueue(diaper('event-close-concurrent-clears'));
    await local.close();
    let continueRemoval: (() => void) | undefined;
    let notifyRemovalStarted: (() => void) | undefined;
    const removalStarted = new Promise<void>(resolve => {
      notifyRemovalStarted = resolve;
    });
    const removalCanFinish = new Promise<void>(resolve => {
      continueRemoval = resolve;
    });
    removeItem.mockImplementationOnce(async key => {
      notifyRemovalStarted?.();
      await removalCanFinish;
      storage.delete(key);
    });

    const first = local.clear();
    let secondSettled = false;
    const second = local.clear().then(() => {
      secondSettled = true;
    });
    await removalStarted;
    await Promise.resolve();

    expect(secondSettled).toBe(false);
    expect(storage.size).toBe(1);
    continueRemoval?.();
    await Promise.all([first, second]);
    expect(storage.size).toBe(0);
  });

  it('does not purge through a replacement writer after close', async () => {
    const original = new PersistentCareEventSyncStore(scope, storagePort);
    await original.saveAndEnqueue(diaper('event-original-closed'));
    await original.close();
    const replacement = new PersistentCareEventSyncStore(scope, storagePort);
    const replacementEvent = diaper('event-replacement-active');
    await replacement.saveAndEnqueue(replacementEvent);

    await expect(original.clear()).rejects.toThrow('already active');
    await expect(original.close()).rejects.toThrow('already active');
    await expect(replacement.list(scope)).resolves.toContainEqual(
      replacementEvent,
    );

    await replacement.close();
    await expect(original.clear()).resolves.toBeUndefined();
    expect(storage.size).toBe(0);
  });

  it('lets a repository privacy purge upgrade a concurrent close', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    await local.saveAndEnqueue(diaper('event-repository-close-clear'));
    const repository = new LocalFirstCareEventRepository(
      local,
      new ScriptedRemoteStore(),
    );

    const closing = repository.close();
    const clearing = repository.clear();
    await Promise.all([closing, clearing]);

    expect(storage.size).toBe(0);
  });

  it('does not release a replacement writer after hydration failure cleanup', async () => {
    let getCalls = 0;
    let removeCalls = 0;
    let continueSecondRemoval: (() => void) | undefined;
    let notifySecondRemoval: (() => void) | undefined;
    const secondRemovalStarted = new Promise<void>(resolve => {
      notifySecondRemoval = resolve;
    });
    const secondRemovalCanFinish = new Promise<void>(resolve => {
      continueSecondRemoval = resolve;
    });
    const dedicatedStorage: StringStoragePort = {
      getItem: async () => {
        getCalls += 1;
        return getCalls === 1 ? '{"version":1,"events":"poisoned"}' : null;
      },
      setItem: async () => undefined,
      removeItem: async () => {
        removeCalls += 1;
        if (removeCalls === 2) {
          notifySecondRemoval?.();
          await secondRemovalCanFinish;
        }
      },
    };
    const failing = new PersistentCareEventSyncStore(scope, dedicatedStorage);
    const clearing = failing.clear();
    await secondRemovalStarted;

    expect(
      () => new PersistentCareEventSyncStore(scope, dedicatedStorage),
    ).toThrow('already active');
    continueSecondRemoval?.();
    await clearing;

    const replacement = new PersistentCareEventSyncStore(
      scope,
      dedicatedStorage,
    );
    expect(
      () => new PersistentCareEventSyncStore(scope, dedicatedStorage),
    ).toThrow('already active');
    await replacement.close();
  });

  it('does not automatically requeue non-retryable remote failures', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    remote.pushHandler = async () => {
      throw {remoteError: {code: 'permission_denied'}};
    };
    const repository = new LocalFirstCareEventRepository(local, remote);
    const event = diaper('event-denied');

    await repository.save(event);
    await repository.syncNow();
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'failed',
      failureKind: 'permission_denied',
    });

    remote.pushHandler = async mutation => ({
      kind: 'applied',
      remote: mutation.event,
    });
    await repository.syncNow({retryFailed: true});

    expect(remote.pushes).toHaveLength(1);
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'failed',
      failureKind: 'permission_denied',
    });
  });

  it('retries an unauthenticated outbox after authoritative Auth recovery', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    remote.pushHandler = async () => {
      throw {remoteError: {code: 'unauthenticated'}};
    };
    const repository = new LocalFirstCareEventRepository(local, remote);
    const event = diaper('event-auth-recovered');

    await repository.save(event);
    await repository.syncNow();
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'failed',
      failureKind: 'unauthenticated',
    });

    remote.pushHandler = async mutation => ({
      kind: 'applied',
      remote: mutation.event,
    });
    await repository.retryFailures(['unauthenticated']);

    expect(remote.pushes).toHaveLength(2);
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'synced',
    });
    await repository.clear();
  });

  it('uses the server projection and preserves a conflict state on divergence', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const event = diaper('event-conflict', 'wet');
    const server = diaper('event-conflict', 'dirty');
    remote.pushHandler = async () => ({kind: 'revision_conflict', remote: server});
    const repository = new LocalFirstCareEventRepository(local, remote);

    await repository.save(event);
    await repository.syncNow();

    expect(await repository.findById(scope.groupId, event.id)).toEqual(server);
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });
  });

  // #100: 충돌 → 해소 선택("다시 반영") → outbox 비움.
  it('reapplies a conflicting local change on top of the server revision', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const event = diaper('event-reapply', 'wet');
    const server = diaper('event-reapply', 'dirty');
    remote.pushHandler = async () => ({
      kind: 'revision_conflict',
      remote: server,
    });
    const repository = new LocalFirstCareEventRepository(local, remote);

    await repository.save(event);
    await repository.syncNow();
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });

    remote.pushHandler = async mutation => ({
      kind: 'applied',
      remote: mutation.event,
    });
    await repository.reapplyConflicts();

    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'synced',
      pendingRevisions: [],
    });
    const resolved = await repository.findById(scope.groupId, event.id);
    expect(resolved).toMatchObject({diaperType: 'wet'});
  });

  // #100: 충돌 → 해소 선택("그대로 두기") → outbox 비움.
  it('discards a conflicting local change and keeps the server revision', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const event = diaper('event-discard', 'wet');
    const server = diaper('event-discard', 'dirty');
    remote.pushHandler = async () => ({
      kind: 'revision_conflict',
      remote: server,
    });
    const repository = new LocalFirstCareEventRepository(local, remote);

    await repository.save(event);
    await repository.syncNow();
    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });

    await repository.discardConflicts();

    expect(await repository.getSyncState(event.id)).toMatchObject({
      status: 'synced',
      pendingRevisions: [],
    });
    expect(await repository.findById(scope.groupId, event.id)).toEqual(server);
    expect(remote.pushes).toHaveLength(1);
  });

  it('removes the losing local sleep projection and persists its conflict issue', async () => {
    const localStore = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const local = activeSleep();
    const server = createCareEvent(
      {
        groupId: scope.groupId,
        babyId: scope.babyId,
        caregiverId: userId('user-2'),
        kind: 'sleep',
        sleepType: 'night',
        startedAt: 1_500,
      },
      {id: eventId('sleep-server'), now: 2_500},
    ) as Extract<CareEvent, {kind: 'sleep'}>;
    remote.pushHandler = async () => ({
      kind: 'active_sleep_conflict',
      remoteActiveSleep: server,
    });
    const repository = new LocalFirstCareEventRepository(localStore, remote);

    await repository.save(local);
    await repository.syncNow();

    expect(await repository.list(scope)).toEqual([server]);
    expect(await repository.getSyncState(local.id)).toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });

    await localStore.close();
    const restarted = new PersistentCareEventSyncStore(scope, storagePort);
    expect(await restarted.list(scope)).toEqual([server]);
    expect(await restarted.getSyncState(local.id)).toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });
  });

  // #104: 수면 겹침 충돌("내 수정 다시 반영") → issue 가 사라지고 새 mutation 으로 재전송된다.
  it('reapplies a sleep-conflict local sleep on top of the server active-sleep record', async () => {
    const localStore = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const local = activeSleep();
    const server = createCareEvent(
      {
        groupId: scope.groupId,
        babyId: scope.babyId,
        caregiverId: userId('user-2'),
        kind: 'sleep',
        sleepType: 'night',
        startedAt: 1_500,
      },
      {id: eventId('sleep-server'), now: 2_500},
    ) as Extract<CareEvent, {kind: 'sleep'}>;
    remote.pushHandler = async () => ({
      kind: 'active_sleep_conflict',
      remoteActiveSleep: server,
    });
    const repository = new LocalFirstCareEventRepository(localStore, remote);

    await repository.save(local);
    await repository.syncNow();
    expect(await repository.getSyncState(local.id)).toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });

    remote.pushHandler = async mutation => ({
      kind: 'applied',
      remote: mutation.event,
    });
    await repository.reapplyConflicts();

    expect(await repository.getSyncState(local.id)).toMatchObject({
      status: 'synced',
      pendingRevisions: [],
    });

    await localStore.close();
    const restarted = new PersistentCareEventSyncStore(scope, storagePort);
    expect(await restarted.getSyncState(local.id)).toMatchObject({
      status: 'synced',
      pendingRevisions: [],
    });
  });

  // #104: 수면 겹침 충돌("서버 기록 그대로 두기") → issue 가 사라지고 재전송하지 않는다.
  it('discards a sleep-conflict local sleep and keeps the server active-sleep record', async () => {
    const localStore = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const local = activeSleep();
    const server = createCareEvent(
      {
        groupId: scope.groupId,
        babyId: scope.babyId,
        caregiverId: userId('user-2'),
        kind: 'sleep',
        sleepType: 'night',
        startedAt: 1_500,
      },
      {id: eventId('sleep-server'), now: 2_500},
    ) as Extract<CareEvent, {kind: 'sleep'}>;
    remote.pushHandler = async () => ({
      kind: 'active_sleep_conflict',
      remoteActiveSleep: server,
    });
    const repository = new LocalFirstCareEventRepository(localStore, remote);

    await repository.save(local);
    await repository.syncNow();
    expect(await repository.getSyncState(local.id)).toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });

    await repository.discardConflicts();

    expect(await repository.getSyncState(local.id)).toMatchObject({
      status: 'synced',
      pendingRevisions: [],
    });
    expect(await repository.list(scope)).toEqual([server]);
    expect(remote.pushes).toHaveLength(1);

    await localStore.close();
    const restarted = new PersistentCareEventSyncStore(scope, storagePort);
    expect(await restarted.getSyncState(local.id)).toMatchObject({
      status: 'synced',
      pendingRevisions: [],
    });
  });

  it('does not treat an observation error as an empty remote snapshot', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const repository = new LocalFirstCareEventRepository(local, remote);
    const event = diaper('event-observe-error');
    await repository.save(event);
    await repository.syncNow();
    const snapshots: (readonly CareEvent[])[] = [];
    let notifyFirstSnapshot: (() => void) | undefined;
    const firstSnapshot = new Promise<void>(resolve => {
      notifyFirstSnapshot = resolve;
    });
    const stop = repository.observe(scope, events => {
      snapshots.push(events);
      notifyFirstSnapshot?.();
    });
    await firstSnapshot;

    remote.emit({
      kind: 'error',
      error: {code: 'permission_denied'},
    });

    expect(snapshots.at(-1)).toEqual([event]);
    stop();
  });

  it.each(['retryable', 'unauthenticated'] as const)(
    'automatically retries a %s outbox after a server reconnect snapshot',
    async failureKind => {
      const local = new PersistentCareEventSyncStore(scope, storagePort);
      const remote = new ScriptedRemoteStore();
      let attempts = 0;
      let notifyRetried: (() => void) | undefined;
      const retried = new Promise<void>(resolve => {
        notifyRetried = resolve;
      });
      remote.pushHandler = async mutation => {
        attempts += 1;
        if (attempts === 1) {
          throw {remoteError: {code: failureKind}};
        }
        notifyRetried?.();
        return {kind: 'applied', remote: mutation.event};
      };
      const repository = new LocalFirstCareEventRepository(local, remote);
      const stop = repository.observe(scope, () => undefined);
      const event = diaper('event-reconnect');

      await repository.save(event);
      await repository.syncNow();
      expect(await repository.getSyncState(event.id)).toMatchObject({
        status: 'failed',
        failureKind,
      });

      remote.emit({kind: 'server_snapshot', events: []});
      await retried;
      await repository.syncNow();

      expect(remote.pushes).toHaveLength(2);
      expect(await repository.getSyncState(event.id)).toMatchObject({
        status: 'synced',
      });
      stop();
      await repository.clear();
    },
  );

  it('removes a remotely moved event from the local filtered projection', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    const repository = new LocalFirstCareEventRepository(local, remote);
    const event = diaper('event-moved-out-of-range');
    await repository.save(event);
    await repository.syncNow();
    let notifyInitial: (() => void) | undefined;
    let notifyMoved: (() => void) | undefined;
    const initial = new Promise<void>(resolve => {
      notifyInitial = resolve;
    });
    const moved = new Promise<void>(resolve => {
      notifyMoved = resolve;
    });
    const snapshots: (readonly CareEvent[])[] = [];
    const stop = repository.observe(
      {...scope, from: 500, to: 1_500},
      events => {
        snapshots.push(events);
        if (events.some(candidate => candidate.id === event.id)) {
          notifyInitial?.();
        } else if (snapshots.length > 1) {
          notifyMoved?.();
        }
      },
    );
    await initial;

    remote.emit({
      kind: 'server_snapshot',
      events: [
        {
          ...event,
          occurredAt: 2_000,
          updatedAt: 3_000,
          revision: 2,
        },
      ],
    });
    await moved;

    expect(snapshots.at(-1)).toEqual([]);
    expect(remote.queries[0]).toEqual({
      groupId: scope.groupId,
      babyId: scope.babyId,
      includeDeleted: true,
    });
    stop();
    await repository.clear();
  });

  it('stops remote observers and ignores in-flight remote work after purge', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    let resolvePush: ((result: CareEventPushResult) => void) | undefined;
    let notifyPushStarted: (() => void) | undefined;
    const pushStarted = new Promise<void>(resolve => {
      notifyPushStarted = resolve;
    });
    remote.pushHandler = () =>
      new Promise(resolve => {
        resolvePush = resolve;
        notifyPushStarted?.();
      });
    const repository = new LocalFirstCareEventRepository(local, remote);
    const stop = repository.observe(
      {
        ...scope,
        from: 500,
        to: 1_500,
        kinds: ['diaper'],
        limit: 1,
      },
      () => undefined,
    );
    const localEvent = diaper('event-purge-local');
    const lateRemoteEvent = diaper('event-purge-remote', 'dirty');

    await repository.save(localEvent);
    await pushStarted;
    expect(remote.listenerCount).toBe(1);
    expect(remote.queries[0]).not.toHaveProperty('limit');

    await repository.clear();
    expect(remote.listenerCount).toBe(0);
    expect(remote.queries[0]).toEqual({
      groupId: scope.groupId,
      babyId: scope.babyId,
      includeDeleted: true,
    });

    remote.lastListener?.({
      kind: 'server_snapshot',
      events: [lateRemoteEvent],
    });
    resolvePush?.({kind: 'applied', remote: localEvent});
    await Promise.resolve();
    await Promise.resolve();

    const restarted = new PersistentCareEventSyncStore(scope, storagePort);
    expect(await restarted.list(scope)).toEqual([]);
    stop();
  });

  it('waits for a flush requested while another remote push is active', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    const remote = new ScriptedRemoteStore();
    let resolveFirst: ((result: CareEventPushResult) => void) | undefined;
    let notifyFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>(resolve => {
      notifyFirstStarted = resolve;
    });
    remote.pushHandler = mutation => {
      if (mutation.event.id === eventId('event-flush-first')) {
        return new Promise(resolve => {
          resolveFirst = resolve;
          notifyFirstStarted?.();
        });
      }
      return Promise.resolve({kind: 'applied', remote: mutation.event});
    };
    const repository = new LocalFirstCareEventRepository(local, remote);
    const first = diaper('event-flush-first');
    const second = diaper('event-flush-second');

    await repository.save(first);
    await firstStarted;
    await repository.save(second);
    const synchronized = repository.syncNow();
    resolveFirst?.({kind: 'applied', remote: first});
    await synchronized;

    expect(remote.pushes.map(mutation => mutation.event.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(await repository.getSyncState(second.id)).toMatchObject({
      status: 'synced',
    });
  });

  it('isolates and purges data by authenticated user/group/baby scope', async () => {
    const first = new PersistentCareEventSyncStore(scope, storagePort);
    await first.saveAndEnqueue(diaper('event-private'));
    const other = new PersistentCareEventSyncStore(
      {
        ...scope,
        userId: userId('user-2'),
      },
      storagePort,
    );

    expect(await other.list(scope)).toEqual([]);
    await first.clear();
    const restarted = new PersistentCareEventSyncStore(scope, storagePort);
    expect(await restarted.list(scope)).toEqual([]);
  });

  it('closes synchronously and serializes storage removal with the purge', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    await local.saveAndEnqueue(diaper('event-before-purge'));
    let continueRemoval: (() => void) | undefined;
    let notifyRemovalStarted: (() => void) | undefined;
    const removalStarted = new Promise<void>(resolve => {
      notifyRemovalStarted = resolve;
    });
    const removalCanFinish = new Promise<void>(resolve => {
      continueRemoval = resolve;
    });
    removeItem.mockImplementationOnce(async key => {
      notifyRemovalStarted?.();
      await removalCanFinish;
      storage.delete(key);
    });

    const clearing = local.clear();
    await removalStarted;

    await expect(
      local.saveAndEnqueue(diaper('event-after-purge')),
    ).rejects.toThrow('closed');
    continueRemoval?.();
    await clearing;

    expect(storage.size).toBe(0);
    const reopened = new PersistentCareEventSyncStore(scope, storagePort);
    await expect(reopened.list(scope)).resolves.toEqual([]);
    await reopened.close();
  });

  it('falls back to direct removal when the empty-envelope write fails', async () => {
    const local = new PersistentCareEventSyncStore(scope, storagePort);
    await local.saveAndEnqueue(diaper('event-purge-fallback'));
    failNextWrite = true;

    await expect(local.clear()).resolves.toBeUndefined();
    expect(storage.size).toBe(0);
  });

  it('purges a corrupt envelope and surfaces unsynced-data loss explicitly', async () => {
    const original = new PersistentCareEventSyncStore(scope, storagePort);
    await original.saveAndEnqueue(diaper('event-corrupt'));
    const key = [...storage.keys()][0];
    storage.set(key, '{"version":1,"events":"poisoned"}');

    await original.close();

    const corrupted = new PersistentCareEventSyncStore(scope, storagePort);
    await expect(corrupted.list(scope)).rejects.toBeInstanceOf(
      CareEventSyncHydrationError,
    );
    expect(storage.has(key)).toBe(false);
    await corrupted.clear();
  });

  it('retries a failed corrupt-envelope purge when storage recovers', async () => {
    let raw: string | null = '{"version":1,"events":"poisoned"}';
    let removeCalls = 0;
    const recoveringStorage: StringStoragePort = {
      getItem: async () => raw,
      setItem: async () => undefined,
      removeItem: async () => {
        removeCalls += 1;
        if (removeCalls === 1) {
          throw new Error('storage temporarily unavailable');
        }
        raw = null;
      },
    };
    const corrupted = new PersistentCareEventSyncStore(
      scope,
      recoveringStorage,
    );

    await expect(corrupted.list(scope)).rejects.toBeInstanceOf(
      CareEventSyncHydrationError,
    );
    expect(raw).not.toBeNull();

    await expect(corrupted.clear()).resolves.toBeUndefined();
    expect(raw).toBeNull();
    expect(removeCalls).toBe(2);
  });
});
