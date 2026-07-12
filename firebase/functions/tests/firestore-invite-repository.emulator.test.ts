import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { FirestoreInviteRepository } from '../src/firestore-invite-repository.js';
import { hashInviteCode } from '../src/invite-crypto.js';
import { InviteServiceError } from '../src/invite-error.js';
import { InviteService } from '../src/invite-service.js';
import type { InviteCodeGenerator } from '../src/types.js';

const PROJECT_ID = 'babycare-functions-test';
const GROUP_ID = 'group-alpha';
const OWNER_ID = 'owner-user';
const HMAC_SECRET = 'emulator-only-hmac-key-with-at-least-32-bytes';
const STARTED_AT = 1_720_000_000_000;

class MutableClock {
  constructor(public value: number) {}

  now(): number {
    return this.value;
  }
}

class SequenceCodeGenerator implements InviteCodeGenerator {
  #index = 0;

  constructor(private readonly codes: readonly string[]) {}

  generate(): string {
    const code = this.codes[this.#index];
    if (!code) {
      throw new Error('No emulator invite code remains');
    }
    this.#index += 1;
    return code;
  }
}

let app: App;
let firestore: Firestore;

function createService(input: {
  codes: readonly string[];
  clock?: MutableClock;
  createLimit?: number;
  acceptLimit?: number;
}) {
  const clock = input.clock ?? new MutableClock(STARTED_AT);
  return {
    clock,
    service: new InviteService({
      repository: new FirestoreInviteRepository(firestore),
      clock,
      codeGenerator: new SequenceCodeGenerator(input.codes),
      config: {
        hmacSecret: HMAC_SECRET,
        inviteTtlMs: 24 * 60 * 60 * 1_000,
        rateLimitWindowMs: 60 * 60 * 1_000,
        createLimitPerWindow: input.createLimit ?? 10,
        acceptLimitPerWindow: input.acceptLimit ?? 20,
      },
    }),
  };
}

async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST must be set by emulators:exec');
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.equal(response.ok, true, await response.text());
}

async function seedGroup(): Promise<void> {
  await firestore.doc(`groups/${GROUP_ID}`).set({
    id: GROUP_ID,
    name: '하루 돌봄 그룹',
    ownerId: OWNER_ID,
    babyIds: [],
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
  });
  await firestore.doc(`groups/${GROUP_ID}/members/${OWNER_ID}`).set({
    userId: OWNER_ID,
    groupId: GROUP_ID,
    caregiverRole: 'parent',
    membershipRole: 'owner',
    displayName: '보호자',
    color: '#5FB49C',
    joinedAt: STARTED_AT,
  });
}

before(async () => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    'Run through pnpm run test:functions:emulator',
  );
  app = initializeApp({ projectId: PROJECT_ID }, 'invite-functions-emulator-tests');
  firestore = getFirestore(app);
});

beforeEach(async () => {
  await clearFirestore();
  await seedGroup();
});

after(async () => {
  await deleteApp(app);
});

describe('FirestoreInviteRepository + InviteService', () => {
  it('owner만 raw code 없이 invite를 생성하고 actor audit를 남긴다', async () => {
    const { service } = createService({ codes: ['ABCDEF'] });
    const created = await service.createInvite({
      groupId: GROUP_ID,
      requestedByUid: OWNER_ID,
    });
    const invite = (
      await firestore.doc(`invites/${created.inviteId}`).get()
    ).data();

    assert.ok(invite);
    assert.equal(created.createdAt, STARTED_AT);
    assert.equal(invite.createdAt, created.createdAt);
    assert.equal(invite.codeHash, hashInviteCode(created.code, HMAC_SECRET));
    assert.equal(invite.createdByUid, OWNER_ID);
    assert.equal(JSON.stringify(invite).includes(created.code), false);

    const audit = (
      await firestore.doc(`auditLogs/invite_create_${created.inviteId}`).get()
    ).data();
    assert.equal(audit?.actorUid, OWNER_ID);
    assert.equal(audit?.action, 'invite.create');

    const nonOwner = createService({ codes: ['BCDEFG'] }).service;
    await assert.rejects(
      nonOwner.createInvite({
        groupId: GROUP_ID,
        requestedByUid: 'member-without-owner-role',
      }),
      (error) => error instanceof InviteServiceError && error.code === 'permission-denied',
    );
  });

  it('accept를 transaction으로 1회 사용하고 7-field membership과 actor audit를 만든다', async () => {
    const { service } = createService({ codes: ['CDEFGH'] });
    const created = await service.createInvite({
      groupId: GROUP_ID,
      requestedByUid: OWNER_ID,
    });

    const membership = await service.acceptInvite({
      code: created.code,
      acceptedByUid: 'member-user',
      displayName: '할머니',
      caregiverRole: 'grandparent',
      color: '#4A90E2',
    });
    assert.deepEqual(Object.keys(membership).sort(), [
      'caregiverRole',
      'color',
      'displayName',
      'groupId',
      'joinedAt',
      'membershipRole',
      'userId',
    ]);

    const invite = (
      await firestore.doc(`invites/${created.inviteId}`).get()
    ).data();
    assert.equal(invite?.status, 'accepted');
    assert.equal(invite?.acceptedByUid, 'member-user');
    assert.equal(invite?.acceptedAt, STARTED_AT);

    const persistedMembership = (
      await firestore.doc(`groups/${GROUP_ID}/members/member-user`).get()
    ).data();
    assert.deepEqual(persistedMembership, membership);

    const audit = (
      await firestore.doc(`auditLogs/invite_accept_${created.inviteId}`).get()
    ).data();
    assert.equal(audit?.actorUid, 'member-user');
    assert.equal(audit?.invitedByUid, OWNER_ID);
    assert.equal(audit?.targetUid, 'member-user');

    const idempotentReplay = await service.acceptInvite({
      code: created.code,
      acceptedByUid: 'member-user',
      displayName: '무시되는 재시도 입력',
    });
    assert.deepEqual(idempotentReplay, membership);
  });

  it('동시 accept 중 정확히 한 uid만 membership을 얻는다', async () => {
    const { service } = createService({ codes: ['DEFGHJ'] });
    const created = await service.createInvite({
      groupId: GROUP_ID,
      requestedByUid: OWNER_ID,
    });

    const results = await Promise.allSettled([
      service.acceptInvite({
        code: created.code,
        acceptedByUid: 'member-a',
        displayName: '멤버 A',
      }),
      service.acceptInvite({
        code: created.code,
        acceptedByUid: 'member-b',
        displayName: '멤버 B',
      }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);

    const members = await firestore
      .collection(`groups/${GROUP_ID}/members`)
      .get();
    assert.equal(members.size, 2);
    const acceptedInvite = (
      await firestore.doc(`invites/${created.inviteId}`).get()
    ).data();
    assert.ok(['member-a', 'member-b'].includes(acceptedInvite?.acceptedByUid));
  });

  it('expiry와 uid별 create rate limit을 server transaction에서 강제한다', async () => {
    const clock = new MutableClock(STARTED_AT);
    const { service } = createService({
      codes: ['EFGHJK', 'FGHJKL'],
      clock,
      createLimit: 1,
    });
    const created = await service.createInvite({
      groupId: GROUP_ID,
      requestedByUid: OWNER_ID,
    });

    await assert.rejects(
      service.createInvite({
        groupId: GROUP_ID,
        requestedByUid: OWNER_ID,
      }),
      (error) => error instanceof InviteServiceError && error.code === 'resource-exhausted',
    );

    clock.value += 24 * 60 * 60 * 1_000 + 1;
    await assert.rejects(
      service.acceptInvite({
        code: created.code,
        acceptedByUid: 'late-member',
        displayName: '늦은 멤버',
      }),
      (error) => error instanceof InviteServiceError && error.code === 'failed-precondition',
    );
  });

  it('존재하지 않는 유효 형식 code 시도도 accept rate limit에 누적한다', async () => {
    const { service } = createService({
      codes: ['ABCDEF'],
      acceptLimit: 2,
    });

    for (const code of ['ABCDEF', 'BCDEFG']) {
      await assert.rejects(
        service.acceptInvite({
          code,
          acceptedByUid: 'brute-force-user',
          displayName: '시도자',
        }),
        (error) => error instanceof InviteServiceError && error.code === 'not-found',
      );
    }

    await assert.rejects(
      service.acceptInvite({
        code: 'CDEFGH',
        acceptedByUid: 'brute-force-user',
        displayName: '시도자',
      }),
      (error) => error instanceof InviteServiceError && error.code === 'resource-exhausted',
    );

    const rate = (
      await firestore
        .doc('functionRateLimits/brute-force-user/actions/invite-accept')
        .get()
    ).data();
    assert.equal(rate?.count, 2);
  });
});
