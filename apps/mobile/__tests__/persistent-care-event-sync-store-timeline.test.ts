import {
  babyId,
  careEventCursorFromEvent,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
  type StringStoragePort,
} from '@babycare/product-core';
import {
  careEventMutationId,
  careEventPayloadHash,
  CareEventSyncHydrationError,
  PersistentCareEventSyncStore,
  type CareEventSyncScope,
  type CareEventTimelineCoverage,
} from '@babycare/product-data';

class MemoryStringStorage implements StringStoragePort {
  readonly values = new Map<string, string>();
  readonly successfulWrites: Array<{readonly key: string; readonly value: string}> = [];
  readonly removals: string[] = [];
  setAttempts = 0;
  failNextSet = false;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.setAttempts += 1;
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('timeline envelope write failed');
    }
    this.values.set(key, value);
    this.successfulWrites.push({key, value});
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
    this.removals.push(key);
  }
}

const scope: CareEventSyncScope = {
  userId: userId('timeline-user'),
  groupId: groupId('timeline-group'),
  babyId: babyId('timeline-baby'),
};

function scopedStorageKey(): string {
  return [
    '@babycare/care-event-sync/v1',
    encodeURIComponent(scope.userId),
    encodeURIComponent(scope.groupId),
    encodeURIComponent(scope.babyId),
  ].join('/');
}

function diaperAt(
  id: string,
  occurredAt: number,
  diaperType: 'wet' | 'dirty' = 'wet',
): Extract<CareEvent, {kind: 'diaper'}> {
  return createCareEvent(
    {
      ...scope,
      caregiverId: scope.userId,
      kind: 'diaper',
      diaperType,
      occurredAt,
    },
    {id: eventId(id), now: occurredAt + 1_000},
  ) as Extract<CareEvent, {kind: 'diaper'}>;
}

function updateDiaper(
  event: Extract<CareEvent, {kind: 'diaper'}>,
  diaperType: 'wet' | 'dirty',
): Extract<CareEvent, {kind: 'diaper'}> {
  return {
    ...event,
    diaperType,
    revision: event.revision + 1,
    updatedAt: event.updatedAt + 1_000,
  };
}

function softDelete(event: CareEvent): CareEvent {
  const deletedAt = event.updatedAt + 1_000;
  return {
    ...event,
    deletedAt,
    revision: event.revision + 1,
    updatedAt: deletedAt,
  };
}

function coverageFor(
  events: readonly CareEvent[],
  hasMore: boolean,
): CareEventTimelineCoverage {
  const last = events.at(-1);
  return {
    remoteEventIds: events.map(event => event.id),
    ...(last ? {endCursor: careEventCursorFromEvent(last)} : {}),
    hasMore,
    loadedRawCount: events.length,
  };
}

function pendingV1Entry(event: CareEvent) {
  return {
    id: careEventMutationId(event),
    kind: 'create' as const,
    event,
    baseRevision: event.revision - 1,
    payloadHash: careEventPayloadHash(event),
    attempts: 0,
    status: 'pending' as const,
  };
}

describe('PersistentCareEventSyncStore timeline coverage', () => {
  it('migrates a v1 envelope to durable v2 coverage and restores it after restart', async () => {
    const storage = new MemoryStringStorage();
    const synced = diaperAt('migration-synced', 5_000);
    const pending = diaperAt('migration-pending', 4_000);
    storage.values.set(
      scopedStorageKey(),
      JSON.stringify({
        version: 1,
        scope,
        events: [synced, pending],
        outbox: [pendingV1Entry(pending)],
        issues: [],
      }),
    );

    const migrated = new PersistentCareEventSyncStore(scope, storage);
    const expectedCoverage = {
      remoteEventIds: [synced.id],
      endCursor: careEventCursorFromEvent(synced),
      hasMore: true,
      loadedRawCount: 1,
    };
    await expect(migrated.getTimelineCoverage()).resolves.toEqual(
      expectedCoverage,
    );
    await migrated.mergeRemoteEvents([]);
    await migrated.close();

    const persisted = JSON.parse(storage.values.get(scopedStorageKey())!);
    expect(persisted).toMatchObject({
      version: 2,
      timelineCoverage: expectedCoverage,
    });

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getTimelineCoverage()).resolves.toEqual(
      expectedCoverage,
    );
    await expect(restarted.list({...scope, includeDeleted: true})).resolves.toEqual([
      synced,
      pending,
    ]);
    await expect(restarted.nextPending()).resolves.toMatchObject({
      id: careEventMutationId(pending),
      event: pending,
    });
    await restarted.close();
  });

  it('discards a v2 envelope whose end cursor does not match the coverage tail', async () => {
    const storage = new MemoryStringStorage();
    const event = diaperAt('cursor-tail', 5_000);
    const first = new PersistentCareEventSyncStore(scope, storage);
    await first.replaceRemoteTimelinePrefix(
      [event],
      coverageFor([event], false),
    );
    await first.close();

    const key = scopedStorageKey();
    const poisoned = JSON.parse(storage.values.get(key)!);
    poisoned.timelineCoverage.endCursor.eventId = 'different-valid-event';
    storage.values.set(key, JSON.stringify(poisoned));

    const corrupted = new PersistentCareEventSyncStore(scope, storage);
    await expect(corrupted.getTimelineCoverage()).rejects.toBeInstanceOf(
      CareEventSyncHydrationError,
    );
    expect(storage.values.has(key)).toBe(false);
    await corrupted.clear();
  });

  it('commits a replacement prefix and coverage in one envelope and rolls both back on write failure', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const newest = diaperAt('atomic-newest', 5_000);
    const old = diaperAt('atomic-old', 3_000);
    const replacement = diaperAt('atomic-replacement', 2_000);
    const initialEvents = [newest, old];
    const initialCoverage = coverageFor(initialEvents, true);
    await store.replaceRemoteTimelinePrefix(initialEvents, initialCoverage);
    const initialRaw = storage.values.get(scopedStorageKey());

    const replacementEvents = [newest, replacement];
    const replacementCoverage = coverageFor(replacementEvents, false);
    storage.failNextSet = true;
    await expect(
      store.replaceRemoteTimelinePrefix(
        replacementEvents,
        replacementCoverage,
      ),
    ).rejects.toThrow('timeline envelope write failed');

    await expect(store.getTimelineCoverage()).resolves.toEqual(
      initialCoverage,
    );
    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual(
      initialEvents,
    );
    expect(storage.values.get(scopedStorageKey())).toBe(initialRaw);

    await store.replaceRemoteTimelinePrefix(
      replacementEvents,
      replacementCoverage,
    );
    const committed = JSON.parse(storage.values.get(scopedStorageKey())!);
    expect(committed.events).toEqual(replacementEvents);
    expect(committed.timelineCoverage).toEqual(replacementCoverage);
    expect(storage.setAttempts).toBe(3);
    await store.close();
  });

  it('evicts a removed synced row from the authoritative prefix', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const kept = diaperAt('eviction-kept', 5_000);
    const removed = diaperAt('eviction-removed', 4_000);
    await store.replaceRemoteTimelinePrefix(
      [kept, removed],
      coverageFor([kept, removed], false),
    );

    await store.replaceRemoteTimelinePrefix(
      [kept],
      coverageFor([kept], false),
    );

    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual([
      kept,
    ]);
    await expect(store.findById(scope.groupId, removed.id)).resolves.toBeUndefined();
    await expect(store.getTimelineCoverage()).resolves.toEqual(
      coverageFor([kept], false),
    );
    await store.close();
  });

  it('evicts synced rows outside prior coverage while preserving a pending overlay', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const authoritative = diaperAt('untracked-authoritative', 6_000);
    const remoteOnly = diaperAt('untracked-remote', 5_000);
    const acknowledged = diaperAt('untracked-acknowledged', 4_000);
    const pending = diaperAt('untracked-pending', 3_000);
    await store.mergeRemoteEvents([remoteOnly]);
    await store.saveAndEnqueue(acknowledged);
    await store.markSynced(careEventMutationId(acknowledged));
    await store.saveAndEnqueue(pending);
    await expect(store.getTimelineCoverage()).resolves.toEqual({
      remoteEventIds: [],
      hasMore: true,
      loadedRawCount: 0,
    });

    await store.replaceRemoteTimelinePrefix(
      [authoritative],
      coverageFor([authoritative], false),
    );

    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual([
      authoritative,
      pending,
    ]);
    await expect(
      store.findById(scope.groupId, remoteOnly.id),
    ).resolves.toBeUndefined();
    await expect(
      store.findById(scope.groupId, acknowledged.id),
    ).resolves.toBeUndefined();
    await expect(store.getSyncState(pending.id)).resolves.toMatchObject({
      status: 'pending',
    });
    await store.close();
  });

  it('preserves pending, failed, and conflict overlays removed from the remote prefix', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const pendingBase = diaperAt('overlay-pending', 5_000);
    const failedBase = diaperAt('overlay-failed', 4_000);
    const conflictBase = diaperAt('overlay-conflict', 3_000);
    await store.replaceRemoteTimelinePrefix(
      [pendingBase, failedBase, conflictBase],
      coverageFor([pendingBase, failedBase, conflictBase], false),
    );

    const pending = updateDiaper(pendingBase, 'dirty');
    const failed = updateDiaper(failedBase, 'dirty');
    const conflict = updateDiaper(conflictBase, 'dirty');
    await store.saveAndEnqueue(pending);
    await store.saveAndEnqueue(failed);
    await store.saveAndEnqueue(conflict);
    await store.markAttemptStarted(careEventMutationId(failed));
    await store.markFailed(careEventMutationId(failed), 'retryable');
    await store.markAttemptStarted(careEventMutationId(conflict));
    await store.markFailed(careEventMutationId(conflict), 'conflict');

    await store.replaceRemoteTimelinePrefix([], coverageFor([], false));

    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual([
      pending,
      failed,
      conflict,
    ]);
    await expect(store.getSyncState(pending.id)).resolves.toMatchObject({
      status: 'pending',
    });
    await expect(store.getSyncState(failed.id)).resolves.toMatchObject({
      status: 'failed',
      failureKind: 'retryable',
    });
    await expect(store.getSyncState(conflict.id)).resolves.toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });
    await expect(store.getTimelineCoverage()).resolves.toEqual({
      remoteEventIds: [],
      hasMore: false,
      loadedRawCount: 0,
    });
    await store.close();
  });

  it('persists a soft-delete tombstone as a raw cursor boundary across restart', async () => {
    const storage = new MemoryStringStorage();
    const visible = diaperAt('tombstone-visible', 5_000);
    const tombstone = softDelete(diaperAt('tombstone-deleted', 4_000));
    const rawPrefix = [visible, tombstone];
    const expectedCoverage = coverageFor(rawPrefix, false);
    const first = new PersistentCareEventSyncStore(scope, storage);
    await first.replaceRemoteTimelinePrefix(rawPrefix, expectedCoverage);

    await expect(first.list(scope)).resolves.toEqual([visible]);
    await expect(first.list({...scope, includeDeleted: true})).resolves.toEqual(
      rawPrefix,
    );
    await first.close();

    const persisted = JSON.parse(storage.values.get(scopedStorageKey())!);
    expect(persisted.timelineCoverage).toEqual(expectedCoverage);
    expect(persisted.timelineCoverage.remoteEventIds).toContain(tombstone.id);

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getTimelineCoverage()).resolves.toEqual(
      expectedCoverage,
    );
    await expect(restarted.list(scope)).resolves.toEqual([visible]);
    await expect(
      restarted.list({...scope, includeDeleted: true}),
    ).resolves.toEqual(rawPrefix);
    await restarted.close();
  });

  it('rejects an invalid prefix without changing memory, coverage, observers, or storage', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const newer = diaperAt('rollback-newer', 5_000);
    const older = diaperAt('rollback-older', 4_000);
    const validPrefix = [newer, older];
    const validCoverage = coverageFor(validPrefix, false);
    await store.replaceRemoteTimelinePrefix(validPrefix, validCoverage);
    const baselineRaw = storage.values.get(scopedStorageKey());
    const snapshots: Array<readonly CareEvent[]> = [];
    let notifyInitial: (() => void) | undefined;
    const initial = new Promise<void>(resolve => {
      notifyInitial = resolve;
    });
    const stop = store.observe(
      {...scope, includeDeleted: true},
      events => {
        snapshots.push(events);
        notifyInitial?.();
      },
    );
    await initial;

    const reversed = [older, newer];
    await expect(
      store.replaceRemoteTimelinePrefix(
        reversed,
        coverageFor(reversed, false),
      ),
    ).rejects.toThrow('strict newest-first');

    await expect(store.list({...scope, includeDeleted: true})).resolves.toEqual(
      validPrefix,
    );
    await expect(store.getTimelineCoverage()).resolves.toEqual(validCoverage);
    expect(storage.values.get(scopedStorageKey())).toBe(baselineRaw);
    expect(snapshots).toEqual([validPrefix]);
    stop();
    await store.close();
  });

  it('purges timeline rows and coverage on clear', async () => {
    const storage = new MemoryStringStorage();
    const store = new PersistentCareEventSyncStore(scope, storage);
    const event = diaperAt('clear-timeline', 5_000);
    await store.replaceRemoteTimelinePrefix(
      [event],
      coverageFor([event], false),
    );

    await store.clear();

    expect(storage.values.has(scopedStorageKey())).toBe(false);
    expect(storage.removals).toEqual([scopedStorageKey()]);
    const emptiedEnvelope = JSON.parse(storage.successfulWrites.at(-1)!.value);
    expect(emptiedEnvelope).toMatchObject({
      version: 2,
      events: [],
      outbox: [],
      issues: [],
      timelineCoverage: {
        remoteEventIds: [],
        hasMore: true,
        loadedRawCount: 0,
      },
    });

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.list({...scope, includeDeleted: true})).resolves.toEqual(
      [],
    );
    await expect(restarted.getTimelineCoverage()).resolves.toEqual({
      remoteEventIds: [],
      hasMore: true,
      loadedRawCount: 0,
    });
    await restarted.close();
  });
});
