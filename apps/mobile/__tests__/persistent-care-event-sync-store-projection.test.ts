import {
  babyId,
  careEventCursorFromEvent,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
  type SleepEvent,
  type StringStoragePort,
} from '@babycare/product-core';
import {
  careEventMutationId,
  CareEventSyncHydrationError,
  PersistentCareEventSyncStore,
  type CareEventSyncScope,
  type CareEventTimelineCoverage,
} from '@babycare/product-data';

class MemoryStringStorage implements StringStoragePort {
  readonly values = new Map<string, string>();
  failNextSet = false;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('projection envelope write failed');
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const scope: CareEventSyncScope = {
  userId: userId('projection-user'),
  groupId: groupId('projection-group'),
  babyId: babyId('projection-baby'),
};

function scopedStorageKey(): string {
  return [
    '@babycare/care-event-sync/v1',
    encodeURIComponent(scope.userId),
    encodeURIComponent(scope.groupId),
    encodeURIComponent(scope.babyId),
  ].join('/');
}

function diaperAt(id: string, occurredAt: number): CareEvent {
  return createCareEvent(
    {
      ...scope,
      caregiverId: scope.userId,
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt,
    },
    {id: eventId(id), now: occurredAt + 100},
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
    {id: eventId(id), now: startedAt + 100},
  ) as SleepEvent;
}

function endSleep(event: SleepEvent, endedAt: number): SleepEvent {
  return {
    ...event,
    endedAt,
    revision: event.revision + 1,
    updatedAt: endedAt,
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

describe('PersistentCareEventSyncStore named projections', () => {
  it('rejects a v3 envelope with a dangling projection reference', async () => {
    const storage = new MemoryStringStorage();
    const event = diaperAt('dangling-overview', 5_000);
    const first = new PersistentCareEventSyncStore(scope, storage);
    await first.replaceRemoteOverview([event]);
    await first.close();

    const poisoned = JSON.parse(storage.values.get(scopedStorageKey())!);
    poisoned.projectionCoverage.overviewEventIds = ['missing-overview-event'];
    storage.values.set(scopedStorageKey(), JSON.stringify(poisoned));

    const corrupted = new PersistentCareEventSyncStore(scope, storage);
    await expect(corrupted.getProjectionCoverage()).rejects.toBeInstanceOf(
      CareEventSyncHydrationError,
    );
    expect(storage.values.has(scopedStorageKey())).toBe(false);
    await corrupted.clear();
  });

  it('migrates v2 to unknown and server-confirmed none hides stale active rows without losing raw coverage', async () => {
    const storage = new MemoryStringStorage();
    const covered = activeSleepAt('migration-covered-active', 5_000);
    const untracked = activeSleepAt('migration-untracked-active', 4_000);
    storage.values.set(
      scopedStorageKey(),
      JSON.stringify({
        version: 2,
        scope,
        events: [covered, untracked],
        outbox: [],
        issues: [],
        timelineCoverage: coverageFor([covered]),
      }),
    );

    const store = new PersistentCareEventSyncStore(scope, storage);
    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'unknown'},
    });
    await expect(store.list({...scope, kinds: ['sleep']})).resolves.toEqual([
      covered,
      untracked,
    ]);

    const snapshots: (readonly CareEvent[])[] = [];
    let notifyInitial: (() => void) | undefined;
    const initial = new Promise<void>(resolve => {
      notifyInitial = resolve;
    });
    const stop = store.observe(
      {...scope, kinds: ['sleep'], includeDeleted: true},
      events => {
        snapshots.push(events);
        notifyInitial?.();
        notifyInitial = undefined;
      },
    );
    await initial;

    await store.replaceRemoteActiveSleep(undefined);

    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'confirmed_none'},
    });
    await expect(
      store.list({...scope, kinds: ['sleep'], includeDeleted: true}),
    ).resolves.toEqual([]);
    expect(snapshots.at(-1)).toEqual([]);
    await expect(store.findById(scope.groupId, covered.id)).resolves.toEqual(
      covered,
    );
    await expect(
      store.findById(scope.groupId, untracked.id),
    ).resolves.toBeUndefined();
    await expect(store.getTimelineCoverage()).resolves.toEqual(
      coverageFor([covered]),
    );

    const pending = activeSleepAt('migration-pending-active', 6_000);
    await store.saveAndEnqueue(pending);
    await expect(
      store.list({...scope, kinds: ['sleep'], includeDeleted: true}),
    ).resolves.toEqual([pending]);
    await expect(store.getSyncState(pending.id)).resolves.toMatchObject({
      status: 'pending',
    });
    stop();
    await store.close();

    const persisted = JSON.parse(storage.values.get(scopedStorageKey())!);
    expect(persisted).toMatchObject({
      version: 3,
      projectionCoverage: {
        overviewEventIds: [],
        activeSleep: {status: 'confirmed_none'},
      },
      timelineCoverage: coverageFor([covered]),
    });

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'confirmed_none'},
    });
    await expect(
      restarted.list({...scope, kinds: ['sleep'], includeDeleted: true}),
    ).resolves.toEqual([pending]);
    await restarted.close();
  });

  it('keeps an acknowledged local active sleep visible until projection refresh', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    await store.replaceRemoteActiveSleep(undefined);
    const active = activeSleepAt('acknowledged-local-active', 7_000);
    await store.saveAndEnqueue(active);

    await store.markSynced(careEventMutationId(active));

    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'active', eventId: active.id},
    });
    await expect(store.getSyncState(active.id)).resolves.toMatchObject({
      status: 'synced',
    });
    await expect(store.list({...scope, kinds: ['sleep']})).resolves.toEqual([
      active,
    ]);
    await store.close();

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'active', eventId: active.id},
    });
    await expect(
      restarted.list({...scope, kinds: ['sleep']}),
    ).resolves.toEqual([active]);
    await restarted.close();
  });

  it('rejects a stale none projection fetched before a local active acknowledgement', async () => {
    const store = new PersistentCareEventSyncStore(
      scope,
      new MemoryStringStorage(),
    );
    await store.replaceRemoteActiveSleep(undefined);
    const active = activeSleepAt('stale-none-after-ack', 8_000);
    await store.saveAndEnqueue(active);
    await store.markSynced(careEventMutationId(active));

    await expect(
      store.replaceRemoteProjections([], undefined),
    ).rejects.toThrow(
      'Active sleep projection transition must reconcile its previous event',
    );
    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'active', eventId: active.id},
    });
    await expect(store.list({...scope, kinds: ['sleep']})).resolves.toEqual([
      active,
    ]);
    await store.close();
  });

  it('keeps overview rows outside the timeline, evicts stale rows, and preserves pending overlays', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const synced = diaperAt('overview-synced', 5_000);
    const pendingBase = diaperAt('overview-pending', 4_000);
    await store.replaceRemoteOverview([synced, pendingBase]);

    await store.replaceRemoteTimelinePrefix([], coverageFor([]));
    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual(
      [synced, pendingBase],
    );

    const pending = {
      ...pendingBase,
      diaperType: 'dirty' as const,
      revision: pendingBase.revision + 1,
      updatedAt: pendingBase.updatedAt + 1_000,
    };
    await store.saveAndEnqueue(pending);
    await store.replaceRemoteOverview([]);

    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'unknown'},
    });
    await expect(
      store.findById(scope.groupId, synced.id),
    ).resolves.toBeUndefined();
    await expect(store.findById(scope.groupId, pending.id)).resolves.toEqual(
      pending,
    );
    await expect(store.nextPending()).resolves.toMatchObject({
      id: careEventMutationId(pending),
      event: pending,
    });
    await store.close();
  });

  it('replaces active X with Y and keeps a reconciled ended event when clearing', async () => {
    const storage = new MemoryStringStorage();
    const first = new PersistentCareEventSyncStore(scope, storage);
    const activeX = activeSleepAt('active-x', 4_000);
    const activeY = activeSleepAt('active-y', 5_000);
    const endedX = endSleep(activeX, 4_500);
    await first.replaceRemoteActiveSleep(activeX);
    await first.replaceRemoteActiveSleep(activeY, endedX);

    await expect(first.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'active', eventId: activeY.id},
    });
    await expect(first.findById(scope.groupId, activeX.id)).resolves.toEqual(
      endedX,
    );
    await expect(first.list({...scope, kinds: ['sleep']})).resolves.toEqual([
      activeY,
      endedX,
    ]);

    const endedY = endSleep(activeY, 8_000);
    await first.replaceRemoteActiveSleep(undefined, endedY);
    await expect(first.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'confirmed_none'},
    });
    await expect(first.findById(scope.groupId, activeY.id)).resolves.toEqual(
      endedY,
    );
    await expect(first.list({...scope, kinds: ['sleep']})).resolves.toEqual([
      endedY,
      endedX,
    ]);
    await first.close();

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'confirmed_none'},
    });
    await expect(
      restarted.findById(scope.groupId, activeY.id),
    ).resolves.toEqual(endedY);
    await restarted.close();
  });

  it('invalidates an active projection when an optimistic local end is persisted', async () => {
    const storage = new MemoryStringStorage();
    const first = new PersistentCareEventSyncStore(scope, storage);
    const active = activeSleepAt('optimistic-end-active', 5_000);
    await first.replaceRemoteActiveSleep(active);

    const ended = endSleep(active, 7_000);
    await first.saveAndEnqueue(ended);

    await expect(first.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'unknown'},
    });
    await first.replaceRemoteProjections([active], active);
    await expect(first.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [active.id],
      activeSleep: {status: 'unknown'},
    });
    await expect(first.findById(scope.groupId, active.id)).resolves.toEqual(
      ended,
    );
    await first.close();

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [active.id],
      activeSleep: {status: 'unknown'},
    });
    await expect(
      restarted.findById(scope.groupId, active.id),
    ).resolves.toEqual(ended);
    await expect(restarted.nextPending()).resolves.toMatchObject({
      id: careEventMutationId(ended),
      event: ended,
    });
    await restarted.close();
  });

  it('rolls back overview and active projection together when persistence fails', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const overview = diaperAt('rollback-overview', 6_000);
    const replacementOverview = diaperAt('rollback-overview-next', 7_000);
    const activeX = activeSleepAt('rollback-active-x', 5_000);
    const activeY = activeSleepAt('rollback-active-y', 4_000);
    const endedX = endSleep(activeX, 6_000);
    await store.replaceRemoteOverview([overview]);
    await store.replaceRemoteActiveSleep(activeX);
    const baselineRaw = storage.values.get(scopedStorageKey());

    storage.failNextSet = true;
    await expect(
      store.replaceRemoteProjections(
        [replacementOverview],
        activeY,
        endedX,
      ),
    ).rejects.toThrow('projection envelope write failed');

    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [overview.id],
      activeSleep: {status: 'active', eventId: activeX.id},
    });
    await expect(
      store.findById(scope.groupId, activeY.id),
    ).resolves.toBeUndefined();
    await expect(
      store.findById(scope.groupId, replacementOverview.id),
    ).resolves.toBeUndefined();
    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual(
      [overview, activeX],
    );
    expect(storage.values.get(scopedStorageKey())).toBe(baselineRaw);
    await store.close();
  });

  it('rejects divergent synced content at the same immutable revision', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const original = diaperAt('same-revision-divergence', 5_000);
    await store.replaceRemoteOverview([original]);
    const divergent = {...original, diaperType: 'dirty' as const};

    await expect(store.replaceRemoteOverview([divergent])).rejects.toThrow(
      'differs at the current revision',
    );

    await expect(store.findById(scope.groupId, original.id)).resolves.toEqual(
      original,
    );
    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [original.id],
      activeSleep: {status: 'unknown'},
    });
    await store.close();
  });

  it('rejects divergent synced identity without a local conflict overlay', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const original = diaperAt('identity-divergence', 5_000);
    await store.replaceRemoteOverview([original]);
    const divergent = {
      ...original,
      caregiverId: userId('different-caregiver'),
    };

    await expect(store.replaceRemoteOverview([divergent])).rejects.toThrow(
      'identity differs from the remote event',
    );

    await expect(store.findById(scope.groupId, original.id)).resolves.toEqual(
      original,
    );
    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [original.id],
      activeSleep: {status: 'unknown'},
    });
    await store.close();
  });

  it('atomically rejects an older active lock event than the overview row', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const active = activeSleepAt('mixed-projection-active', 5_000);
    const ended = endSleep(active, 7_000);

    await expect(
      store.replaceRemoteProjections([ended], active),
    ).rejects.toThrow('conflicts with the stored event revision');

    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual(
      [],
    );
    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'unknown'},
    });
    await store.close();
  });

  it('validates reconciliation against the active ID captured before overview merge', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const activeX = activeSleepAt('captured-active-x', 4_000);
    const endedX = endSleep(activeX, 6_000);
    const activeY = activeSleepAt('captured-active-y', 7_000);
    const unrelated = activeSleepAt('unrelated-reconcile', 1_000);
    const endedUnrelated = endSleep(unrelated, 2_000);
    await store.replaceRemoteActiveSleep(activeX);

    await expect(
      store.replaceRemoteProjections(
        [endedX],
        activeY,
        endedUnrelated,
      ),
    ).rejects.toThrow('must match the previous projected event');

    await expect(store.getProjectionCoverage()).resolves.toEqual({
      overviewEventIds: [],
      activeSleep: {status: 'active', eventId: activeX.id},
    });
    await expect(store.list({...scope, kinds: ['sleep']})).resolves.toEqual([
      activeX,
    ]);
    await store.close();
  });
});
