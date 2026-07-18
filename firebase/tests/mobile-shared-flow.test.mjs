import assert from 'node:assert/strict';
import {test} from 'node:test';

import {deleteApp, initializeApp} from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  terminate,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions';

import {
  careEventMutationId,
  careEventPayloadHash,
} from '../../packages/product-data/src/care-event-revision.ts';

const PROJECT_ID = 'demo-babycare';
const HOST = process.env.FIREBASE_EMULATOR_HOST ?? '127.0.0.1';
const FIREBASE_OPTIONS = {
  apiKey: 'babycare-emulator-api-key',
  appId: '1:000000000000:web:0000000000000000',
  projectId: PROJECT_ID,
};

function client(name) {
  const app = initializeApp(FIREBASE_OPTIONS, name);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app, 'us-central1');
  connectAuthEmulator(auth, `http://${HOST}:9099`, {disableWarnings: true});
  connectFirestoreEmulator(firestore, HOST, 8085);
  connectFunctionsEmulator(functions, HOST, 5001);
  return {app, auth, firestore, functions};
}

function withTimeout(promise, label, timeoutMs = 10_000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

test('two anonymous caregivers create, invite, share a realtime event, and revoke access', async () => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = client(`owner-${suffix}`);
  const member = client(`member-${suffix}`);
  let stopMemberEvents = () => undefined;

  try {
    const ownerCredential = await signInAnonymously(owner.auth);
    const memberCredential = await signInAnonymously(member.auth);
    const ownerId = ownerCredential.user.uid;
    const memberId = memberCredential.user.uid;
    const groupId = `group-${suffix}`;
    const babyId = `baby-${suffix}`;
    const now = Date.now();

    const groupRef = doc(owner.firestore, 'groups', groupId);
    const ownerSetup = writeBatch(owner.firestore);
    ownerSetup.set(groupRef, {
      id: groupId,
      name: '통합 테스트 아기',
      ownerId,
      babyIds: [babyId],
      createdAt: now,
      updatedAt: now,
    });
    ownerSetup.set(doc(groupRef, 'members', ownerId), {
      userId: ownerId,
      groupId,
      caregiverRole: 'other',
      membershipRole: 'owner',
      displayName: '첫 번째 양육자',
      color: '#5FB49C',
      joinedAt: now,
    });
    ownerSetup.set(doc(groupRef, 'babies', babyId), {
      id: babyId,
      groupId,
      name: '통합 테스트 아기',
      birthDate: '2026-01-01',
      sex: 'unspecified',
      createdAt: now,
      updatedAt: now,
    });
    await ownerSetup.commit();

    const createInvite = httpsCallable(owner.functions, 'createInvite');
    const createdInvite = await createInvite({groupId});
    assert.match(createdInvite.data.code, /^[A-HJ-NP-Z2-9]{6}$/);

    const acceptInvite = httpsCallable(member.functions, 'acceptInvite');
    const accepted = await acceptInvite({
      code: createdInvite.data.code,
      displayName: '두 번째 양육자',
    });
    assert.equal(accepted.data.groupId, groupId);
    assert.equal(accepted.data.userId, memberId);
    assert.equal(accepted.data.membershipRole, 'member');

    const memberObservedEvent = withTimeout(
      new Promise((resolve, reject) => {
        stopMemberEvents = onSnapshot(
          query(
            collection(member.firestore, 'groups', groupId, 'events'),
            where('babyId', '==', babyId),
          ),
          snapshot => {
            const event = snapshot.docs[0]?.data();
            if (event) {
              resolve(event);
            }
          },
          reject,
        );
      }),
      'member realtime event',
    );

    const eventId = `event-${suffix}`;
    const event = {
      id: eventId,
      groupId,
      babyId,
      caregiverId: ownerId,
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const payloadHash = careEventPayloadHash(event);
    const mutationId = careEventMutationId(event);
    const eventDocument = {
      ...event,
      isDeleted: false,
      lastMutationId: mutationId,
      payloadHash,
    };
    const eventWrite = writeBatch(owner.firestore);
    eventWrite.set(doc(groupRef, 'events', eventId), eventDocument);
    eventWrite.set(
      doc(groupRef, 'eventMutationReceipts', mutationId),
      {
        id: mutationId,
        groupId,
        babyId,
        eventId,
        revision: 1,
        payloadHash,
        kind: 'create',
        actorUid: ownerId,
        appliedAt: serverTimestamp(),
        payload: eventDocument,
      },
    );
    assert.equal((await getDoc(groupRef)).exists(), true);
    try {
      await eventWrite.commit();
    } catch (error) {
      throw new Error(`owner event write failed: ${error?.message ?? error}`, {
        cause: error,
      });
    }

    const observed = await memberObservedEvent;
    assert.equal(observed.id, eventId);
    assert.equal(observed.caregiverId, ownerId);
    assert.equal(observed.diaperType, 'wet');
    stopMemberEvents();
    stopMemberEvents = () => undefined;

    await deleteDoc(doc(owner.firestore, 'groups', groupId, 'members', memberId));
    await assert.rejects(
      getDoc(doc(member.firestore, 'groups', groupId)),
      error => error?.code === 'permission-denied',
    );
  } finally {
    stopMemberEvents();
    await Promise.allSettled([
      terminate(owner.firestore),
      terminate(member.firestore),
    ]);
    await Promise.allSettled([deleteApp(owner.app), deleteApp(member.app)]);
  }
});
