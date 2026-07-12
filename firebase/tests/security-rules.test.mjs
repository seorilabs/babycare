import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setLogLevel,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'babycare-rules-test';
const GROUP_ID = 'group-alpha';
const BABY_ID = 'baby-haru';
const OWNER_ID = 'owner-user';
const MEMBER_ID = 'member-user';
const OUTSIDER_ID = 'outsider-user';
const NOW = 1_720_000_000_000;

const firestoreRules = readFileSync(
  new URL('../firestore.rules', import.meta.url),
  'utf8',
);
const storageRules = readFileSync(
  new URL('../storage.rules', import.meta.url),
  'utf8',
);

let testEnv;

setLogLevel('silent');

function parseEmulatorAddress(value, fallbackPort) {
  if (!value) {
    return { host: '127.0.0.1', port: fallbackPort };
  }
  const separator = value.lastIndexOf(':');
  return {
    host: value.slice(0, separator),
    port: Number(value.slice(separator + 1)),
  };
}

function groupFixture() {
  return {
    id: GROUP_ID,
    name: '하루 돌봄 그룹',
    ownerId: OWNER_ID,
    babyIds: [BABY_ID],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function membershipFixture(uid, membershipRole = 'member') {
  return {
    userId: uid,
    groupId: GROUP_ID,
    caregiverRole: 'parent',
    membershipRole,
    displayName: uid,
    color: membershipRole === 'owner' ? '#5FB49C' : '#4A90E2',
    joinedAt: NOW,
  };
}

function babyFixture() {
  return {
    id: BABY_ID,
    groupId: GROUP_ID,
    name: '하루',
    birthDate: '2026-01-02',
    sex: 'unspecified',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function diaperEventFixture({
  id = 'event-diaper-1',
  caregiverId = MEMBER_ID,
  revision = 1,
  updatedAt = NOW,
  ...overrides
} = {}) {
  return {
    id,
    groupId: GROUP_ID,
    babyId: BABY_ID,
    caregiverId,
    kind: 'diaper',
    occurredAt: NOW - 60_000,
    createdAt: NOW,
    updatedAt,
    revision,
    isDeleted: false,
    diaperType: 'wet',
    ...overrides,
  };
}

function feedingEventFixture() {
  return {
    id: 'event-feeding-1',
    groupId: GROUP_ID,
    babyId: BABY_ID,
    caregiverId: MEMBER_ID,
    kind: 'feeding',
    occurredAt: NOW - 120_000,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    isDeleted: false,
    feedingType: 'formula',
    volumeMl: 90,
  };
}

function sleepEventFixture() {
  return {
    id: 'event-sleep-1',
    groupId: GROUP_ID,
    babyId: BABY_ID,
    caregiverId: MEMBER_ID,
    kind: 'sleep',
    occurredAt: NOW - 3_600_000,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    isDeleted: false,
    sleepType: 'nap',
    startedAt: NOW - 3_600_000,
    endedAt: NOW - 1_800_000,
  };
}

const TEST_PAYLOAD_HASH = 'a'.repeat(64);

function eventWithMutationMetadata(event, payloadHash = TEST_PAYLOAD_HASH) {
  return {
    ...event,
    payloadHash,
    lastMutationId: `${event.id}@${event.revision}@${payloadHash}`,
  };
}

function addEventMutation(
  batch,
  db,
  event,
  kind,
  actorUid = event.caregiverId,
  payloadHash = TEST_PAYLOAD_HASH,
) {
  const persistedEvent = eventWithMutationMetadata(event, payloadHash);
  batch.set(
    doc(db, 'groups', GROUP_ID, 'events', event.id),
    persistedEvent,
  );
  batch.set(
    doc(
      db,
      'groups',
      GROUP_ID,
      'eventMutationReceipts',
      persistedEvent.lastMutationId,
    ),
    {
      id: persistedEvent.lastMutationId,
      groupId: GROUP_ID,
      babyId: event.babyId,
      eventId: event.id,
      revision: event.revision,
      payloadHash,
      kind,
      actorUid,
      appliedAt: serverTimestamp(),
      payload: persistedEvent,
    },
  );
  return persistedEvent;
}

function firestoreFor(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function storageFor(uid) {
  return testEnv.authenticatedContext(uid).storage();
}

async function seedBase({ includeEvent = false } = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups', GROUP_ID), groupFixture());
    await setDoc(
      doc(db, 'groups', GROUP_ID, 'members', OWNER_ID),
      membershipFixture(OWNER_ID, 'owner'),
    );
    await setDoc(
      doc(db, 'groups', GROUP_ID, 'members', MEMBER_ID),
      membershipFixture(MEMBER_ID),
    );
    await setDoc(
      doc(db, 'groups', GROUP_ID, 'babies', BABY_ID),
      babyFixture(),
    );
    if (includeEvent) {
      await setDoc(
        doc(db, 'groups', GROUP_ID, 'events', 'event-diaper-1'),
        diaperEventFixture(),
      );
    }
  });
}

before(async () => {
  const firestore = parseEmulatorAddress(
    process.env.FIRESTORE_EMULATOR_HOST,
    8080,
  );
  const storage = parseEmulatorAddress(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    9199,
  );

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { ...firestore, rules: firestoreRules },
    storage: { ...storage, rules: storageRules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

after(async () => {
  await testEnv.cleanup();
});

test('비멤버와 비로그인 사용자는 그룹·아기·이벤트를 읽을 수 없다', async () => {
  await seedBase({ includeEvent: true });

  const outsiderDb = firestoreFor(OUTSIDER_ID);
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(outsiderDb, 'groups', GROUP_ID)));
  await assertFails(
    getDoc(doc(outsiderDb, 'groups', GROUP_ID, 'babies', BABY_ID)),
  );
  await assertFails(
    getDocs(collection(outsiderDb, 'groups', GROUP_ID, 'events')),
  );
  await assertFails(getDoc(doc(anonymousDb, 'groups', GROUP_ID)));
});

test('그룹 멤버는 민감 그룹 데이터를 읽고 자기 명의의 돌봄 이벤트를 기록한다', async () => {
  await seedBase();

  const memberDb = firestoreFor(MEMBER_ID);
  const outsiderDb = firestoreFor(OUTSIDER_ID);
  const event = diaperEventFixture();
  const feedingEvent = feedingEventFixture();
  const sleepEvent = sleepEventFixture();

  const groupSnapshot = await assertSucceeds(
    getDoc(doc(memberDb, 'groups', GROUP_ID)),
  );
  const babySnapshot = await assertSucceeds(
    getDoc(doc(memberDb, 'groups', GROUP_ID, 'babies', BABY_ID)),
  );
  for (const careEvent of [event, feedingEvent, sleepEvent]) {
    const batch = writeBatch(memberDb);
    addEventMutation(batch, memberDb, careEvent, 'create');
    await assertSucceeds(batch.commit());
  }

  assert.equal(groupSnapshot.data().ownerId, OWNER_ID);
  assert.equal(babySnapshot.data().name, '하루');

  const outsiderBatch = writeBatch(outsiderDb);
  addEventMutation(
    outsiderBatch,
    outsiderDb,
    diaperEventFixture({ id: 'event-outsider', caregiverId: OUTSIDER_ID }),
    'create',
    OUTSIDER_ID,
  );
  await assertFails(outsiderBatch.commit());

  const forgedAuthorBatch = writeBatch(memberDb);
  addEventMutation(
    forgedAuthorBatch,
    memberDb,
    diaperEventFixture({ id: 'event-forged-author', caregiverId: OWNER_ID }),
    'create',
    MEMBER_ID,
  );
  await assertFails(forgedAuthorBatch.commit());

  const extraFieldBatch = writeBatch(memberDb);
  addEventMutation(
    extraFieldBatch,
    memberDb,
    diaperEventFixture({
      id: 'event-extra-field',
      diagnosis: 'client가 임의로 추가한 field',
    }),
    'create',
  );
  await assertFails(extraFieldBatch.commit());
});

test('사용자는 collectionGroup query로 자기 멤버십만 조회할 수 있다', async () => {
  await seedBase();

  const memberDb = firestoreFor(MEMBER_ID);
  const memberships = await assertSucceeds(
    getDocs(
      query(
        collectionGroup(memberDb, 'members'),
        where('userId', '==', MEMBER_ID),
      ),
    ),
  );
  assert.equal(memberships.size, 1);
  assert.equal(memberships.docs[0].data().groupId, GROUP_ID);

  await assertFails(
    getDocs(
      query(
        collectionGroup(memberDb, 'members'),
        where('userId', '==', OWNER_ID),
      ),
    ),
  );
});

test('멤버십 생성·수정·삭제는 owner만 가능하고 owner 역할은 단일하게 유지된다', async () => {
  await seedBase();

  const ownerDb = firestoreFor(OWNER_ID);
  const memberDb = firestoreFor(MEMBER_ID);
  const guestId = 'guest-user';
  const guestRefForOwner = doc(
    ownerDb,
    'groups',
    GROUP_ID,
    'members',
    guestId,
  );

  await assertFails(
    setDoc(
      doc(memberDb, 'groups', GROUP_ID, 'members', guestId),
      membershipFixture(guestId),
    ),
  );
  await assertFails(setDoc(guestRefForOwner, membershipFixture(guestId)));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'groups', GROUP_ID, 'members', guestId),
      membershipFixture(guestId),
    );
  });
  await assertFails(
    updateDoc(
      doc(memberDb, 'groups', GROUP_ID, 'members', guestId),
      { displayName: '변조된 이름' },
    ),
  );
  await assertSucceeds(updateDoc(guestRefForOwner, { displayName: '할머니' }));
  await assertFails(updateDoc(guestRefForOwner, { membershipRole: 'owner' }));
  await assertFails(
    deleteDoc(doc(ownerDb, 'groups', GROUP_ID, 'members', OWNER_ID)),
  );
  await assertSucceeds(deleteDoc(guestRefForOwner));
});

test('멤버십 표시 이름은 C0, C1, bidi control 문자를 거부한다', async () => {
  await seedBase();

  const ownerMembershipRef = doc(
    firestoreFor(OWNER_ID),
    'groups',
    GROUP_ID,
    'members',
    OWNER_ID,
  );
  for (const unsafeCharacter of [
    '\u0000',
    '\u001F',
    '\u007F',
    '\u009F',
    '\u061C',
    '\u200E',
    '\u200F',
    '\u202A',
    '\u202E',
    '\u2066',
    '\u2069',
  ]) {
    await assertFails(
      updateDoc(ownerMembershipRef, {
        displayName: `보호자${unsafeCharacter}위장`,
      }),
    );
  }
  await assertSucceeds(
    updateDoc(ownerMembershipRef, { displayName: '보호자 이름' }),
  );
});

test('그룹·아기 표시 이름도 control 문자를 거부한다', async () => {
  await seedBase();

  const ownerDb = firestoreFor(OWNER_ID);
  await assertFails(
    updateDoc(doc(ownerDb, 'groups', GROUP_ID), {
      name: '가족\u2066위장',
      updatedAt: NOW + 1,
    }),
  );
  await assertFails(
    updateDoc(doc(ownerDb, 'groups', GROUP_ID, 'babies', BABY_ID), {
      name: '아기\n이름',
      updatedAt: NOW + 1,
    }),
  );
});

test('아기 날짜는 실제 ISO calendar date만 허용한다', async () => {
  await seedBase();

  const babyRef = doc(
    firestoreFor(OWNER_ID),
    'groups',
    GROUP_ID,
    'babies',
    BABY_ID,
  );
  for (const birthDate of ['2026-02-29', '2026-02-31', '2026-13-01', '1900-02-29']) {
    await assertFails(updateDoc(babyRef, {birthDate, updatedAt: NOW + 1}));
  }
  await assertSucceeds(
    updateDoc(babyRef, {birthDate: '2024-02-29', updatedAt: NOW + 1}),
  );
});

test('그룹·최초 owner membership·아기를 client batch로 원자 생성할 수 있다', async () => {
  const ownerDb = firestoreFor(OWNER_ID);
  const commitSetup = (group) => {
    const candidate = writeBatch(ownerDb);
    candidate.set(doc(ownerDb, 'groups', GROUP_ID), group);
    candidate.set(
      doc(ownerDb, 'groups', GROUP_ID, 'members', OWNER_ID),
      membershipFixture(OWNER_ID, 'owner'),
    );
    candidate.set(
      doc(ownerDb, 'groups', GROUP_ID, 'babies', BABY_ID),
      babyFixture(),
    );
    return candidate.commit();
  };

  await assertFails(commitSetup({...groupFixture(), babyIds: [123]}));
  await assertFails(
    commitSetup({...groupFixture(), babyIds: [BABY_ID, 'baby-2']}),
  );

  const batch = writeBatch(ownerDb);

  batch.set(doc(ownerDb, 'groups', GROUP_ID), groupFixture());
  batch.set(
    doc(ownerDb, 'groups', GROUP_ID, 'members', OWNER_ID),
    membershipFixture(OWNER_ID, 'owner'),
  );
  batch.set(
    doc(ownerDb, 'groups', GROUP_ID, 'babies', BABY_ID),
    babyFixture(),
  );

  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(ownerDb, 'groups', GROUP_ID)));
  await assertSucceeds(
    getDoc(doc(ownerDb, 'groups', GROUP_ID, 'members', OWNER_ID)),
  );
  await assertSucceeds(
    getDoc(doc(ownerDb, 'groups', GROUP_ID, 'babies', BABY_ID)),
  );
});

test('그룹 hard delete는 owner에게도 금지되어 orphan data의 ID 재사용을 막는다', async () => {
  await seedBase({ includeEvent: true });

  const ownerDb = firestoreFor(OWNER_ID);
  const groupRef = doc(ownerDb, 'groups', GROUP_ID);

  await assertFails(deleteDoc(groupRef));
  const groupSnapshot = await assertSucceeds(getDoc(groupRef));
  assert.equal(groupSnapshot.exists(), true);
});

test('privileged 삭제 workflow가 남긴 tombstone의 group ID는 재사용할 수 없다', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'groupTombstones', GROUP_ID), {
      deletedAt: NOW,
    });
  });

  const ownerDb = firestoreFor(OWNER_ID);
  await assertFails(setDoc(doc(ownerDb, 'groups', GROUP_ID), groupFixture()));
  await assertFails(
    getDoc(doc(ownerDb, 'groupTombstones', GROUP_ID)),
  );
});

test('아기 hard delete와 tombstoned baby ID 재사용은 owner에게도 금지된다', async () => {
  await seedBase();

  const ownerDb = firestoreFor(OWNER_ID);
  const babyRef = doc(ownerDb, 'groups', GROUP_ID, 'babies', BABY_ID);
  await assertSucceeds(
    updateDoc(babyRef, {
      avatarStoragePath: `groups/${GROUP_ID}/babies/${BABY_ID}/avatar/profile.png`,
      updatedAt: NOW + 1,
    }),
  );
  await assertFails(
    updateDoc(babyRef, {
      avatarStoragePath: 'https://example.com/public-download-token.png',
      updatedAt: NOW + 2,
    }),
  );
  await assertFails(deleteDoc(babyRef));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await deleteDoc(doc(adminDb, 'groups', GROUP_ID, 'babies', BABY_ID));
    await setDoc(
      doc(adminDb, 'groups', GROUP_ID, 'babyTombstones', BABY_ID),
      { deletedAt: NOW },
    );
  });

  await assertFails(setDoc(babyRef, babyFixture()));
});

test('이벤트 작성자만 수정할 수 있고 identity 필드는 바꿀 수 없다', async () => {
  await seedBase({ includeEvent: true });

  const memberDb = firestoreFor(MEMBER_ID);
  const ownerDb = firestoreFor(OWNER_ID);
  const eventRefForMember = doc(
    memberDb,
    'groups',
    GROUP_ID,
    'events',
    'event-diaper-1',
  );

  const unauthorizedBatch = writeBatch(ownerDb);
  addEventMutation(
    unauthorizedBatch,
    ownerDb,
    diaperEventFixture({
      note: '작성자가 아닌 수정',
      revision: 2,
      updatedAt: NOW + 1,
    }),
    'update',
    OWNER_ID,
  );
  await assertFails(unauthorizedBatch.commit());

  const updatedEvent = diaperEventFixture({
    note: '기저귀 교체 완료',
    revision: 2,
    updatedAt: NOW + 1,
  });
  const updateBatch = writeBatch(memberDb);
  addEventMutation(
    updateBatch,
    memberDb,
    updatedEvent,
    'update',
  );
  await assertSucceeds(updateBatch.commit());

  const caregiverBatch = writeBatch(memberDb);
  addEventMutation(
    caregiverBatch,
    memberDb,
    {
      ...updatedEvent,
      caregiverId: OWNER_ID,
      revision: 3,
      updatedAt: NOW + 2,
    },
    'update',
    MEMBER_ID,
  );
  await assertFails(caregiverBatch.commit());

  const babyBatch = writeBatch(memberDb);
  addEventMutation(
    babyBatch,
    memberDb,
    {
      ...updatedEvent,
      babyId: 'another-baby',
      revision: 3,
      updatedAt: NOW + 2,
    },
    'update',
  );
  await assertFails(babyBatch.commit());

  const { diaperType: _diaperType, ...eventWithoutSubtype } = updatedEvent;
  const kindBatch = writeBatch(memberDb);
  addEventMutation(
    kindBatch,
    memberDb,
    {
      ...eventWithoutSubtype,
      kind: 'feeding',
      feedingType: 'formula',
      volumeMl: 90,
      revision: 3,
      updatedAt: NOW + 2,
    },
    'update',
  );
  await assertFails(kindBatch.commit());

  const persisted = await assertSucceeds(getDoc(eventRefForMember));
  assert.equal(persisted.data().caregiverId, MEMBER_ID);
  assert.equal(persisted.data().babyId, BABY_ID);
  assert.equal(persisted.data().kind, 'diaper');
});

test('다른 그룹 멤버는 active sleep을 close-only transition으로 종료할 수 있다', async () => {
  await seedBase();

  const activeSleepWithEnd = {
    ...sleepEventFixture(),
    id: 'event-active-sleep',
    caregiverId: OWNER_ID,
  };
  const { endedAt: _endedAt, ...activeSleep } = activeSleepWithEnd;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups', GROUP_ID, 'events', activeSleep.id), activeSleep);
    await setDoc(doc(db, 'groups', GROUP_ID, 'activeSleeps', BABY_ID), {
      groupId: GROUP_ID,
      babyId: BABY_ID,
      eventId: activeSleep.id,
      caregiverId: activeSleep.caregiverId,
      startedAt: activeSleep.startedAt,
      createdAt: activeSleep.createdAt,
    });
  });

  const memberDb = firestoreFor(MEMBER_ID);
  const closedAt = NOW + 1;
  const closedSleep = {
    ...activeSleep,
    endedAt: closedAt,
    updatedAt: closedAt,
    revision: 2,
  };

  const payloadMutationBatch = writeBatch(memberDb);
  addEventMutation(
    payloadMutationBatch,
    memberDb,
    {
      ...closedSleep,
      note: '종료 외 payload 변조',
    },
    'update',
    MEMBER_ID,
  );
  payloadMutationBatch.delete(
    doc(memberDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID),
  );
  await assertFails(payloadMutationBatch.commit());

  const invalidEndBatch = writeBatch(memberDb);
  addEventMutation(
    invalidEndBatch,
    memberDb,
    {
      ...closedSleep,
      endedAt: closedAt + 1,
    },
    'update',
    MEMBER_ID,
  );
  invalidEndBatch.delete(
    doc(memberDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID),
  );
  await assertFails(invalidEndBatch.commit());

  const eventOnlyCloseBatch = writeBatch(memberDb);
  addEventMutation(
    eventOnlyCloseBatch,
    memberDb,
    closedSleep,
    'end_sleep',
    MEMBER_ID,
  );
  await assertFails(eventOnlyCloseBatch.commit());

  const closeBatch = writeBatch(memberDb);
  addEventMutation(
    closeBatch,
    memberDb,
    closedSleep,
    'end_sleep',
    MEMBER_ID,
  );
  closeBatch.delete(
    doc(
      memberDb,
      'groups',
      GROUP_ID,
      'activeSleeps',
      BABY_ID,
    ),
  );
  await assertSucceeds(closeBatch.commit());

  const recloseBatch = writeBatch(memberDb);
  addEventMutation(
    recloseBatch,
    memberDb,
    {
      ...closedSleep,
      endedAt: closedAt + 1,
      updatedAt: closedAt + 1,
      revision: 3,
    },
    'update',
    MEMBER_ID,
  );
  await assertFails(recloseBatch.commit());

  const otherMemberDeleteBatch = writeBatch(memberDb);
  addEventMutation(
    otherMemberDeleteBatch,
    memberDb,
    {
      ...closedSleep,
      deletedAt: closedAt + 1,
      isDeleted: true,
      updatedAt: closedAt + 1,
      revision: 3,
    },
    'soft_delete',
    MEMBER_ID,
  );
  await assertFails(otherMemberDeleteBatch.commit());

  const staleStartedAt = NOW - 49 * 60 * 60 * 1_000;
  const staleSleep = {
    ...activeSleep,
    id: 'event-stale-active-sleep',
    occurredAt: staleStartedAt,
    startedAt: staleStartedAt,
  };
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups', GROUP_ID, 'events', staleSleep.id), staleSleep);
    await setDoc(doc(db, 'groups', GROUP_ID, 'activeSleeps', BABY_ID), {
      groupId: GROUP_ID,
      babyId: BABY_ID,
      eventId: staleSleep.id,
      caregiverId: staleSleep.caregiverId,
      startedAt: staleSleep.startedAt,
      createdAt: staleSleep.createdAt,
    });
  });
  const staleDb = firestoreFor(MEMBER_ID);
  const staleBatch = writeBatch(staleDb);
  addEventMutation(staleBatch, staleDb, {
    ...staleSleep,
    endedAt: staleStartedAt + 48 * 60 * 60 * 1_000,
    updatedAt: NOW + 2,
    revision: 2,
  }, 'end_sleep', MEMBER_ID);
  staleBatch.delete(
    doc(staleDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID),
  );
  await assertSucceeds(staleBatch.commit());
});

test('진행 중 수면은 lock 시각을 유지하면서 note만 수정할 수 있다', async () => {
  await seedBase();

  const activeSleepWithEnd = {
    ...sleepEventFixture(),
    id: 'event-active-update',
    caregiverId: OWNER_ID,
  };
  const { endedAt: _endedAt, ...activeSleep } = activeSleepWithEnd;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups', GROUP_ID, 'events', activeSleep.id), activeSleep);
    await setDoc(doc(db, 'groups', GROUP_ID, 'activeSleeps', BABY_ID), {
      groupId: GROUP_ID,
      babyId: BABY_ID,
      eventId: activeSleep.id,
      caregiverId: activeSleep.caregiverId,
      startedAt: activeSleep.startedAt,
      createdAt: activeSleep.createdAt,
    });
  });

  const ownerDb = firestoreFor(OWNER_ID);
  const noteUpdated = {
    ...activeSleep,
    note: '잠든 장소 확인',
    updatedAt: NOW + 1,
    revision: 2,
  };
  const noteBatch = writeBatch(ownerDb);
  addEventMutation(noteBatch, ownerDb, noteUpdated, 'update', OWNER_ID);
  await assertSucceeds(noteBatch.commit());

  const shiftedStart = activeSleep.startedAt + 60_000;
  const shiftedBatch = writeBatch(ownerDb);
  addEventMutation(
    shiftedBatch,
    ownerDb,
    {
      ...noteUpdated,
      occurredAt: shiftedStart,
      startedAt: shiftedStart,
      updatedAt: NOW + 2,
      revision: 3,
    },
    'update',
    OWNER_ID,
  );
  await assertFails(shiftedBatch.commit());

  const [eventSnapshot, lockSnapshot] = await Promise.all([
    getDoc(doc(ownerDb, 'groups', GROUP_ID, 'events', activeSleep.id)),
    getDoc(doc(ownerDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID)),
  ]);
  assert.equal(eventSnapshot.data().note, '잠든 장소 확인');
  assert.equal(eventSnapshot.data().startedAt, activeSleep.startedAt);
  assert.equal(lockSnapshot.data().startedAt, activeSleep.startedAt);
});

test('active sleep event와 baby singleton lock은 원자적으로 생성되고 동시 시작은 하나만 성공한다', async () => {
  await seedBase();

  const memberDb = firestoreFor(MEMBER_ID);
  const eventOnlyWithEnd = {
    ...sleepEventFixture(),
    id: 'event-active-without-lock',
    caregiverId: MEMBER_ID,
  };
  const { endedAt: _eventOnlyEnd, ...eventOnly } = eventOnlyWithEnd;
  const eventOnlyBatch = writeBatch(memberDb);
  addEventMutation(
    eventOnlyBatch,
    memberDb,
    eventOnly,
    'create',
    MEMBER_ID,
  );
  await assertFails(eventOnlyBatch.commit());
  await assertFails(
    setDoc(doc(memberDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID), {
      groupId: GROUP_ID,
      babyId: BABY_ID,
      eventId: 'missing-active-event',
      caregiverId: MEMBER_ID,
      startedAt: NOW - 1_000,
      createdAt: NOW,
    }),
  );

  const mismatchedLockEvent = {
    ...eventOnly,
    id: 'event-active-lock-mismatch',
  };
  const mismatchedLockBatch = writeBatch(memberDb);
  addEventMutation(
    mismatchedLockBatch,
    memberDb,
    mismatchedLockEvent,
    'create',
    MEMBER_ID,
  );
  mismatchedLockBatch.set(
    doc(memberDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID),
    {
      groupId: GROUP_ID,
      babyId: BABY_ID,
      eventId: mismatchedLockEvent.id,
      caregiverId: mismatchedLockEvent.caregiverId,
      startedAt: mismatchedLockEvent.startedAt + 1,
      createdAt: mismatchedLockEvent.createdAt,
    },
  );
  await assertFails(mismatchedLockBatch.commit());

  const ownerDb = firestoreFor(OWNER_ID);
  const first = {
    ...eventOnly,
    id: 'event-active-race-member',
    caregiverId: MEMBER_ID,
  };
  const second = {
    ...eventOnly,
    id: 'event-active-race-owner',
    caregiverId: OWNER_ID,
  };
  const firstBatch = writeBatch(memberDb);
  addEventMutation(firstBatch, memberDb, first, 'create', MEMBER_ID);
  firstBatch.set(doc(memberDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID), {
    groupId: GROUP_ID,
    babyId: BABY_ID,
    eventId: first.id,
    caregiverId: first.caregiverId,
    startedAt: first.startedAt,
    createdAt: first.createdAt,
  });
  const secondBatch = writeBatch(ownerDb);
  addEventMutation(secondBatch, ownerDb, second, 'create', OWNER_ID);
  secondBatch.set(doc(ownerDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID), {
    groupId: GROUP_ID,
    babyId: BABY_ID,
    eventId: second.id,
    caregiverId: second.caregiverId,
    startedAt: second.startedAt,
    createdAt: second.createdAt,
  });

  const results = await Promise.allSettled([
    firstBatch.commit(),
    secondBatch.commit(),
  ]);
  assert.equal(
    results.filter(result => result.status === 'fulfilled').length,
    1,
  );
  const [firstSnapshot, secondSnapshot, lockSnapshot] = await Promise.all([
    getDoc(doc(memberDb, 'groups', GROUP_ID, 'events', first.id)),
    getDoc(doc(memberDb, 'groups', GROUP_ID, 'events', second.id)),
    getDoc(doc(memberDb, 'groups', GROUP_ID, 'activeSleeps', BABY_ID)),
  ]);
  assert.equal(Number(firstSnapshot.exists()) + Number(secondSnapshot.exists()), 1);
  assert.equal(
    lockSnapshot.data().eventId,
    firstSnapshot.exists() ? first.id : second.id,
  );
});

test('event mutation receipt는 event/revision/hash/payload에 결합된 원자 전이만 허용한다', async () => {
  await seedBase({ includeEvent: true });

  const memberDb = firestoreFor(MEMBER_ID);
  const payloadHash = 'a'.repeat(64);
  const futurePayloadHash = 'b'.repeat(64);
  const eventRef = doc(
    memberDb,
    'groups',
    GROUP_ID,
    'events',
    'event-diaper-1',
  );
  const receiptRef = doc(
    memberDb,
    'groups',
    GROUP_ID,
    'eventMutationReceipts',
    `event-diaper-1@2@${payloadHash}`,
  );

  // A malicious client cannot preclaim a receipt for a future revision.
  await assertFails(
    setDoc(
      doc(
        memberDb,
        'groups',
        GROUP_ID,
        'eventMutationReceipts',
        `event-diaper-1@2@${futurePayloadHash}`,
      ),
      {
        id: `event-diaper-1@2@${futurePayloadHash}`,
        groupId: GROUP_ID,
        babyId: BABY_ID,
        eventId: 'event-diaper-1',
        revision: 2,
        payloadHash: futurePayloadHash,
        kind: 'update',
        actorUid: MEMBER_ID,
        appliedAt: serverTimestamp(),
        payload: eventWithMutationMetadata(
          diaperEventFixture({revision: 2, updatedAt: NOW + 1}),
          futurePayloadHash,
        ),
      },
    ),
  );

  // A receipt cannot be attached to an already-existing current revision.
  await assertFails(
    setDoc(
      doc(
        memberDb,
        'groups',
        GROUP_ID,
        'eventMutationReceipts',
        `event-diaper-1@1@${payloadHash}`,
      ),
      {
        id: `event-diaper-1@1@${payloadHash}`,
        groupId: GROUP_ID,
        babyId: BABY_ID,
        eventId: 'event-diaper-1',
        revision: 1,
        payloadHash,
        kind: 'create',
        actorUid: MEMBER_ID,
        appliedAt: serverTimestamp(),
        payload: eventWithMutationMetadata(diaperEventFixture(), payloadHash),
      },
    ),
  );

  const updatedEvent = eventWithMutationMetadata(
    diaperEventFixture({
      revision: 2,
      updatedAt: NOW + 1,
      diaperType: 'dirty',
    }),
    payloadHash,
  );
  await assertFails(setDoc(eventRef, updatedEvent));

  const invalidPathBatch = writeBatch(memberDb);
  invalidPathBatch.set(eventRef, updatedEvent);
  invalidPathBatch.set(
    doc(
      memberDb,
      'groups',
      GROUP_ID,
      'eventMutationReceipts',
      `event-diaper-1@2@${futurePayloadHash}`,
    ),
    {
      id: `event-diaper-1@2@${payloadHash}`,
      groupId: GROUP_ID,
      babyId: BABY_ID,
      eventId: 'event-diaper-1',
      revision: 2,
      payloadHash,
      kind: 'update',
      actorUid: MEMBER_ID,
      appliedAt: serverTimestamp(),
      payload: updatedEvent,
    },
  );
  await assertFails(invalidPathBatch.commit());

  const mismatchedPayloadBatch = writeBatch(memberDb);
  mismatchedPayloadBatch.set(eventRef, updatedEvent);
  mismatchedPayloadBatch.set(receiptRef, {
    id: `event-diaper-1@2@${payloadHash}`,
    groupId: GROUP_ID,
    babyId: BABY_ID,
    eventId: 'event-diaper-1',
    revision: 2,
    payloadHash,
    kind: 'update',
    actorUid: MEMBER_ID,
    appliedAt: serverTimestamp(),
    payload: {...updatedEvent, diaperType: 'wet'},
  });
  await assertFails(mismatchedPayloadBatch.commit());

  const validBatch = writeBatch(memberDb);
  validBatch.set(eventRef, updatedEvent);
  validBatch.set(receiptRef, {
    id: `event-diaper-1@2@${payloadHash}`,
    groupId: GROUP_ID,
    babyId: BABY_ID,
    eventId: 'event-diaper-1',
    revision: 2,
    payloadHash,
    kind: 'update',
    actorUid: MEMBER_ID,
    appliedAt: serverTimestamp(),
    payload: updatedEvent,
  });
  await assertSucceeds(
    validBatch.commit(),
  );
  await assertSucceeds(getDoc(receiptRef));
  await assertFails(
    getDoc(
      doc(
        firestoreFor(OWNER_ID),
        'groups',
        GROUP_ID,
        'eventMutationReceipts',
        `event-diaper-1@2@${payloadHash}`,
      ),
    ),
  );
  const missingReceipt = await assertSucceeds(
    getDoc(
      doc(
        memberDb,
        'groups',
        GROUP_ID,
        'eventMutationReceipts',
        `event-missing@99@${futurePayloadHash}`,
      ),
    ),
  );
  assert.equal(missingReceipt.exists(), false);
  await assertFails(
    getDoc(
      doc(
        memberDb,
        'groups',
        GROUP_ID,
        'eventMutationReceipts',
        'invalid-receipt-id',
      ),
    ),
  );
  await assertFails(
    getDocs(
      collection(
        memberDb,
        'groups',
        GROUP_ID,
        'eventMutationReceipts',
      ),
    ),
  );
  await assertFails(
    getDocs(
      query(
        collection(
          memberDb,
          'groups',
          GROUP_ID,
          'eventMutationReceipts',
        ),
        where('actorUid', '==', MEMBER_ID),
      ),
    ),
  );
  await assertFails(updateDoc(receiptRef, {kind: 'update'}));
  await assertFails(deleteDoc(receiptRef));
  await assertFails(
    getDoc(
      doc(
        firestoreFor(OUTSIDER_ID),
        'groups',
        GROUP_ID,
        'eventMutationReceipts',
        `event-diaper-1@2@${payloadHash}`,
      ),
    ),
  );
});

test('이벤트는 hard delete·undelete를 막고 작성자의 단일 soft delete만 허용한다', async () => {
  await seedBase({ includeEvent: true });

  const memberDb = firestoreFor(MEMBER_ID);
  const ownerDb = firestoreFor(OWNER_ID);
  const eventRef = doc(
    memberDb,
    'groups',
    GROUP_ID,
    'events',
    'event-diaper-1',
  );

  await assertFails(deleteDoc(eventRef));
  const deletedEvent = diaperEventFixture({
    deletedAt: NOW + 1,
    isDeleted: true,
    updatedAt: NOW + 1,
    revision: 2,
  });

  const unauthorizedDeleteBatch = writeBatch(ownerDb);
  addEventMutation(
    unauthorizedDeleteBatch,
    ownerDb,
    deletedEvent,
    'soft_delete',
    OWNER_ID,
  );
  await assertFails(unauthorizedDeleteBatch.commit());

  const mixedDeleteBatch = writeBatch(memberDb);
  addEventMutation(
    mixedDeleteBatch,
    memberDb,
    {
      ...deletedEvent,
      note: '삭제와 내용 변경을 동시에 시도',
    },
    'update',
  );
  await assertFails(mixedDeleteBatch.commit());

  const deleteBatch = writeBatch(memberDb);
  addEventMutation(
    deleteBatch,
    memberDb,
    deletedEvent,
    'soft_delete',
  );
  await assertSucceeds(deleteBatch.commit());

  const undeleteBatch = writeBatch(memberDb);
  addEventMutation(
    undeleteBatch,
    memberDb,
    diaperEventFixture({
      updatedAt: NOW + 2,
      revision: 3,
    }),
    'update',
  );
  await assertFails(undeleteBatch.commit());

  const postDeleteUpdateBatch = writeBatch(memberDb);
  addEventMutation(
    postDeleteUpdateBatch,
    memberDb,
    {
      ...deletedEvent,
      note: '삭제 후 재수정',
      deletedAt: NOW + 2,
      updatedAt: NOW + 2,
      revision: 3,
    },
    'update',
  );
  await assertFails(postDeleteUpdateBatch.commit());

  const preDeleted = diaperEventFixture({
    id: 'event-predeleted',
    deletedAt: NOW,
    isDeleted: true,
  });
  const preDeletedBatch = writeBatch(memberDb);
  addEventMutation(preDeletedBatch, memberDb, preDeleted, 'create');
  await assertFails(preDeletedBatch.commit());
});

test('악성 client가 미래 timestamp로 타임라인과 revision을 오염시킬 수 없다', async () => {
  await seedBase({ includeEvent: true });

  const memberDb = firestoreFor(MEMBER_ID);
  const future = Date.now() + 10 * 60 * 1_000;
  const futureEvent = diaperEventFixture({
    id: 'event-future',
    occurredAt: future,
  });

  const futureCreateBatch = writeBatch(memberDb);
  addEventMutation(
    futureCreateBatch,
    memberDb,
    futureEvent,
    'create',
  );
  await assertFails(futureCreateBatch.commit());

  const futureUpdateBatch = writeBatch(memberDb);
  addEventMutation(
    futureUpdateBatch,
    memberDb,
    diaperEventFixture({
      note: '먼 미래 revision 고정',
      updatedAt: future,
      revision: 2,
    }),
    'update',
  );
  await assertFails(futureUpdateBatch.commit());

  const startedAt = Date.now();
  const futureSleep = {
    ...sleepEventFixture(),
    id: 'event-future-sleep-end',
    occurredAt: startedAt,
    startedAt,
    endedAt: future,
    createdAt: future,
    updatedAt: future,
  };
  const futureSleepBatch = writeBatch(memberDb);
  addEventMutation(
    futureSleepBatch,
    memberDb,
    futureSleep,
    'create',
  );
  await assertFails(futureSleepBatch.commit());
});

test('event timestamp 관계와 document ID는 client decoder 경계와 일치한다', async () => {
  await seedBase();
  const memberDb = firestoreFor(MEMBER_ID);

  const skewedBatch = writeBatch(memberDb);
  addEventMutation(
    skewedBatch,
    memberDb,
    diaperEventFixture({
      id: 'event-skewed',
      createdAt: 0,
      updatedAt: 0,
      occurredAt: NOW,
    }),
    'create',
  );
  await assertFails(skewedBatch.commit());

  const unsafeIdBatch = writeBatch(memberDb);
  addEventMutation(
    unsafeIdBatch,
    memberDb,
    diaperEventFixture({id: ' event-space '}),
    'create',
  );
  await assertFails(unsafeIdBatch.commit());
});

test('feeding·sleep subtype의 필수 field와 범위를 Rules에서 재검증한다', async () => {
  await seedBase();

  const memberDb = firestoreFor(MEMBER_ID);
  const invalidFeeding = {
    ...feedingEventFixture(),
    id: 'event-invalid-feeding',
    volumeMl: 0,
  };
  const tooLongSleep = {
    ...sleepEventFixture(),
    id: 'event-too-long-sleep',
    occurredAt: NOW - 49 * 60 * 60 * 1_000,
    startedAt: NOW - 49 * 60 * 60 * 1_000,
    endedAt: NOW,
  };
  const {
    feedingType: _feedingType,
    ...missingFeedingType
  } = feedingEventFixture();
  const {
    sleepType: _sleepType,
    ...missingSleepType
  } = sleepEventFixture();

  const invalidFeedingBatch = writeBatch(memberDb);
  addEventMutation(
    invalidFeedingBatch,
    memberDb,
    invalidFeeding,
    'create',
  );
  await assertFails(invalidFeedingBatch.commit());

  const tooLongSleepBatch = writeBatch(memberDb);
  addEventMutation(
    tooLongSleepBatch,
    memberDb,
    tooLongSleep,
    'create',
  );
  await assertFails(tooLongSleepBatch.commit());

  const missingFeedingTypeBatch = writeBatch(memberDb);
  addEventMutation(
    missingFeedingTypeBatch,
    memberDb,
    {...missingFeedingType, id: 'event-missing-feeding-type'},
    'create',
  );
  await assertFails(missingFeedingTypeBatch.commit());

  const missingSleepTypeBatch = writeBatch(memberDb);
  addEventMutation(
    missingSleepTypeBatch,
    memberDb,
    {...missingSleepType, id: 'event-missing-sleep-type'},
    'create',
  );
  await assertFails(missingSleepTypeBatch.commit());
});

test('invites 문서는 모든 client 직접 read/write를 거부한다', async () => {
  await seedBase();

  const ownerDb = firestoreFor(OWNER_ID);
  const inviteRef = doc(ownerDb, 'invites', 'invite-code-1');
  const invite = {
    groupId: GROUP_ID,
    invitedBy: OWNER_ID,
    expiresAt: NOW + 86_400_000,
    used: false,
  };

  await assertFails(setDoc(inviteRef, invite));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'invites', 'invite-code-1'), invite);
  });

  await assertFails(getDoc(inviteRef));
  await assertFails(updateDoc(inviteRef, { used: true }));
  await assertFails(deleteDoc(inviteRef));
  await assertFails(
    setDoc(doc(ownerDb, 'auditLogs', 'forged-audit'), {
      action: 'invite.accept',
      actorUid: OWNER_ID,
    }),
  );
  await assertFails(
    setDoc(
      doc(ownerDb, 'functionRateLimits', OWNER_ID, 'actions', 'invite-create'),
      { count: 0 },
    ),
  );
});

test('Storage 아기 이미지는 현재 그룹 멤버만 접근하고 멤버 제거 즉시 차단된다', async () => {
  await seedBase();

  const objectPath = `groups/${GROUP_ID}/babies/${BABY_ID}/avatar/profile.png`;
  const memberObject = ref(storageFor(MEMBER_ID), objectPath);
  const outsiderObject = ref(storageFor(OUTSIDER_ID), objectPath);
  const anonymousObject = ref(
    testEnv.unauthenticatedContext().storage(),
    objectPath,
  );
  const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  await assertSucceeds(
    uploadBytes(memberObject, imageBytes, { contentType: 'image/png' }),
  );
  const downloaded = await assertSucceeds(getBytes(memberObject));
  assert.deepEqual(new Uint8Array(downloaded), imageBytes);
  await assertFails(getBytes(outsiderObject));
  await assertFails(getBytes(anonymousObject));
  await assertFails(
    uploadBytes(anonymousObject, imageBytes, { contentType: 'image/png' }),
  );
  await assertFails(
    uploadBytes(
      ref(storageFor(OUTSIDER_ID), `groups/${GROUP_ID}/babies/${BABY_ID}/outsider.png`),
      imageBytes,
      { contentType: 'image/png' },
    ),
  );
  await assertFails(
    uploadBytes(
      ref(storageFor(MEMBER_ID), `groups/${GROUP_ID}/babies/${BABY_ID}/memo.txt`),
      new TextEncoder().encode('민감 메모'),
      { contentType: 'text/plain' },
    ),
  );
  await assertFails(
    uploadBytes(
      ref(storageFor(MEMBER_ID), 'unscoped/profile.png'),
      imageBytes,
      { contentType: 'image/png' },
    ),
  );
  await assertFails(
    uploadBytes(
      ref(storageFor(MEMBER_ID), `groups/${GROUP_ID}/babies/${BABY_ID}/too-large.png`),
      new Uint8Array(10 * 1024 * 1024 + 1),
      { contentType: 'image/png' },
    ),
  );
  await assertFails(
    uploadBytes(
      ref(storageFor(MEMBER_ID), `groups/${GROUP_ID}/babies/unknown-baby/avatar.png`),
      imageBytes,
      { contentType: 'image/png' },
    ),
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(
      doc(context.firestore(), 'groups', GROUP_ID, 'members', MEMBER_ID),
    );
  });
  await assertFails(
    getDoc(doc(firestoreFor(MEMBER_ID), 'groups', GROUP_ID)),
  );
  await assertFails(getBytes(memberObject));
});
