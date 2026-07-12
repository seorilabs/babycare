import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { deleteApp, getApps } from 'firebase-admin/app';
import { HttpsError } from 'firebase-functions/v2/https';

let createInvite: typeof import('../src/index.js').createInvite;
let acceptInvite: typeof import('../src/index.js').acceptInvite;

before(async () => {
  process.env.GCLOUD_PROJECT = 'babycare-callable-unit-test';
  process.env.FUNCTIONS_REGION = 'unit-test-region';
  const functions = await import('../src/index.js');
  createInvite = functions.createInvite;
  acceptInvite = functions.acceptInvite;
});

after(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

describe('callable boundary', () => {
  it('createInvite와 acceptInvite 모두 Auth 없는 호출을 거부한다', async () => {
    for (const callable of [createInvite, acceptInvite]) {
      await assert.rejects(
        callable.run({ data: {} } as never),
        (error) => error instanceof HttpsError && error.code === 'unauthenticated',
      );
    }
  });

  it('인증 후에도 object가 아닌 payload를 거부하고 secret/Firestore에 접근하지 않는다', async () => {
    await assert.rejects(
      createInvite.run({
        auth: { uid: 'owner-user' },
        data: null,
      } as never),
      (error) => error instanceof HttpsError && error.code === 'invalid-argument',
    );
  });
});
