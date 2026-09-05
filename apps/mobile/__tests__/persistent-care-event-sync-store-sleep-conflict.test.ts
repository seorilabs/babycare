import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
  type StringStoragePort,
} from '@babycare/product-core';
import {
  careEventMutationId,
  PersistentCareEventSyncStore,
  type CareEventSyncScope,
} from '@babycare/product-data';

// #104: active_sleep_conflict issue(#issues)에 대한 reapplyConflicts()/
// discardConflicts() 처리를 store 계층에서 직접(리포지토리의 자동 flush 없이)
// 검증한다 — 재전송이 outbox에 pending으로 들어가는 중간 상태와, 재적재 후에도
// 그 상태가 유지되는지를 리포지토리 레벨 테스트보다 더 정밀하게 본다.

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

const scope: CareEventSyncScope = {
  userId: userId('sleep-conflict-user'),
  groupId: groupId('sleep-conflict-group'),
  babyId: babyId('sleep-conflict-baby'),
};

function localSleep(): Extract<CareEvent, {kind: 'sleep'}> {
  return createCareEvent(
    {
      ...scope,
      caregiverId: scope.userId,
      kind: 'sleep',
      sleepType: 'night',
      startedAt: 1_000,
    },
    {id: eventId('sleep-local'), now: 2_000},
  ) as Extract<CareEvent, {kind: 'sleep'}>;
}

function serverActiveSleep(): Extract<CareEvent, {kind: 'sleep'}> {
  return createCareEvent(
    {
      ...scope,
      caregiverId: userId('other-caregiver'),
      kind: 'sleep',
      sleepType: 'night',
      startedAt: 1_500,
    },
    {id: eventId('sleep-server'), now: 2_500},
  ) as Extract<CareEvent, {kind: 'sleep'}>;
}

async function setUpConflict(storage: MemoryStringStorage) {
  const store = new PersistentCareEventSyncStore(scope, storage);
  const local = localSleep();
  const remote = serverActiveSleep();
  await store.saveAndEnqueue(local);
  const id = careEventMutationId(local);
  await store.markAttemptStarted(id);
  await store.resolveActiveSleepConflict(id, remote);
  return {store, local, remote};
}

describe('PersistentCareEventSyncStore sleep-conflict issue resolution', () => {
  it('reapplyConflicts() moves the issue into a new pending mutation (not yet synced)', async () => {
    const storage = new MemoryStringStorage();
    const {store, local} = await setUpConflict(storage);

    await expect(store.getSyncState(local.id)).resolves.toMatchObject({
      status: 'failed',
      failureKind: 'conflict',
    });

    await store.reapplyConflicts();

    // 아직 아무 push도 없었으므로(리포지토리의 자동 flush를 거치지 않았다),
    // 'synced'가 아니라 'pending'이어야 issue가 사라지고 새 mutation이 outbox에
    // 들어갔다는 것을 (재전송 성공과 분리해) 직접 증명한다 — AC-2.
    const afterReapply = await store.getSyncState(local.id);
    expect(afterReapply.status).toBe('pending');
    expect(afterReapply.failureKind).toBeUndefined();

    await store.close();
  });

  it('keeps the reapplied pending mutation after reload (no conflict resurrection)', async () => {
    const storage = new MemoryStringStorage();
    const {store, local} = await setUpConflict(storage);
    await store.reapplyConflicts();
    await store.close();

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getSyncState(local.id)).resolves.toMatchObject({
      status: 'pending',
    });
    await restarted.close();
  });

  it('discardConflicts() clears the issue and keeps the server record after reload', async () => {
    const storage = new MemoryStringStorage();
    const {store, local, remote} = await setUpConflict(storage);

    await store.discardConflicts();

    await expect(store.getSyncState(local.id)).resolves.toMatchObject({
      status: 'synced',
    });
    await store.close();

    const restarted = new PersistentCareEventSyncStore(scope, storage);
    await expect(restarted.getSyncState(local.id)).resolves.toMatchObject({
      status: 'synced',
    });
    await expect(restarted.findById(scope.groupId, remote.id)).resolves.toEqual(remote);
    await restarted.close();
  });
});
