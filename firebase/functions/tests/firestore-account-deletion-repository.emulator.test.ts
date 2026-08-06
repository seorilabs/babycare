import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { FirestoreAccountDeletionRepository } from '../src/firestore-account-deletion-repository.js';

const PROJECT_ID = 'babycare-functions-test';
const STARTED_AT = 1_720_000_000_000;
let app: App;
let firestore: Firestore;
let deletedStorageGroups: string[];

async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST must be set by emulators:exec');
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.equal(response.ok, true, await response.text());
}

function repository(): FirestoreAccountDeletionRepository {
  return new FirestoreAccountDeletionRepository(firestore, {
    async deleteGroupFiles(groupId) {
      deletedStorageGroups.push(groupId);
    },
  });
}

async function seedGroup(input: {
  readonly groupId: string;
  readonly ownerId: string;
  readonly memberId?: string;
}): Promise<void> {
  const group = firestore.doc(`groups/${input.groupId}`);
  await group.set({
    id: input.groupId,
    name: '하루 돌봄 그룹',
    ownerId: input.ownerId,
    babyIds: ['baby-1'],
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
  });
  await group.collection('members').doc(input.ownerId).set({
    userId: input.ownerId,
    groupId: input.groupId,
    caregiverRole: 'parent',
    membershipRole: 'owner',
    displayName: '보호자',
    color: '#5FB49C',
    joinedAt: STARTED_AT,
  });
  if (input.memberId) {
    await group.collection('members').doc(input.memberId).set({
      userId: input.memberId,
      groupId: input.groupId,
      caregiverRole: 'grandparent',
      membershipRole: 'member',
      displayName: '할머니',
      color: '#4A90E2',
      joinedAt: STARTED_AT,
    });
  }
}

before(async () => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    'Run through pnpm run test:functions:emulator',
  );
  app = initializeApp({ projectId: PROJECT_ID }, 'account-deletion-emulator-tests');
  firestore = getFirestore(app);
});

beforeEach(async () => {
  await clearFirestore();
  deletedStorageGroups = [];
});

after(async () => {
  await deleteApp(app);
});

describe('FirestoreAccountDeletionRepository', () => {
  it('member 계정은 membership과 작성 기록·식별자만 삭제한다', async () => {
    await seedGroup({ groupId: 'group-member', ownerId: 'owner-1', memberId: 'member-1' });
    const group = firestore.doc('groups/group-member');
    await group.collection('events').doc('event-1').set({
      caregiverId: 'member-1',
      babyId: 'baby-1',
    });
    await group.collection('activeSleeps').doc('baby-1').set({ eventId: 'event-1' });
    await group.collection('eventMutationReceipts').doc('receipt-1').set({
      actorUid: 'member-1',
      eventId: 'event-1',
    });
    await group.collection('eventMutationReceipts').doc('receipt-2').set({
      actorUid: 'owner-1',
      eventId: 'event-1',
    });
    await group.collection('eventMutationReceipts').doc('receipt-kept').set({
      actorUid: 'owner-1',
      eventId: 'event-owner',
    });
    await firestore.doc('invites/invite-1').set({
      groupId: 'group-member',
      createdByUid: 'owner-1',
      acceptedByUid: 'member-1',
    });
    await firestore.doc('auditLogs/audit-1').set({
      groupId: 'group-member',
      actorUid: 'member-1',
      targetUid: 'member-1',
      invitedByUid: 'owner-1',
    });
    await firestore.doc('functionRateLimits/member-1/actions/invite-accept').set({ count: 1 });
    await firestore.doc('users/member-1/profile/private').set({ value: true });

    const result = await repository().deleteAccountData('member-1', STARTED_AT + 1);
    assert.deepEqual(result, { deletedGroups: 0, deletedMemberships: 1 });
    assert.equal((await group.get()).exists, true);
    for (const path of [
      'groups/group-member/members/member-1',
      'groups/group-member/events/event-1',
      'groups/group-member/activeSleeps/baby-1',
      'groups/group-member/eventMutationReceipts/receipt-1',
      'groups/group-member/eventMutationReceipts/receipt-2',
      'invites/invite-1',
      'auditLogs/audit-1',
      'functionRateLimits/member-1/actions/invite-accept',
      'users/member-1/profile/private',
    ]) {
      assert.equal((await firestore.doc(path).get()).exists, false, path);
    }
    assert.equal(
      (await group.collection('eventMutationReceipts').doc('receipt-kept').get()).exists,
      true,
    );
    assert.deepEqual(deletedStorageGroups, []);
  });

  it('owner 계정은 Storage와 전체 그룹을 삭제하고 tombstone을 남긴다', async () => {
    await seedGroup({ groupId: 'group-owner', ownerId: 'owner-1', memberId: 'member-1' });
    await firestore.doc('groups/group-owner/babies/baby-1').set({ name: '하루' });
    await firestore.doc('groups/group-owner/events/event-1').set({ caregiverId: 'member-1' });
    await firestore.doc('invites/invite-owner').set({
      groupId: 'group-owner',
      createdByUid: 'owner-1',
    });
    await firestore.doc('auditLogs/audit-owner').set({
      groupId: 'group-owner',
      actorUid: 'owner-1',
    });

    const result = await repository().deleteAccountData('owner-1', STARTED_AT + 1);
    assert.deepEqual(result, { deletedGroups: 1, deletedMemberships: 1 });
    assert.deepEqual(deletedStorageGroups, ['group-owner']);
    assert.equal((await firestore.doc('groups/group-owner').get()).exists, false);
    assert.equal((await firestore.doc('invites/invite-owner').get()).exists, false);
    assert.equal((await firestore.doc('auditLogs/audit-owner').get()).exists, false);
    assert.deepEqual((await firestore.doc('groupTombstones/group-owner').get()).data(), {
      id: 'group-owner',
      deletedAt: STARTED_AT + 1,
      reason: 'owner_account_deleted',
    });
  });
});
