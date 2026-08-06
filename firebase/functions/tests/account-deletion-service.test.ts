import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AccountDeletionError } from '../src/account-deletion-error.js';
import { AccountDeletionService } from '../src/account-deletion-service.js';

describe('AccountDeletionService', () => {
  it('requires the explicit destructive confirmation before touching data', async () => {
    let touched = false;
    const service = new AccountDeletionService(
      {
        async deleteAccountData() {
          touched = true;
          return { deletedGroups: 0, deletedMemberships: 0 };
        },
      },
      { async deleteUser() {} },
    );

    await assert.rejects(
      service.deleteAccount({ uid: 'user-1', confirmation: 'delete' }),
      (error) => error instanceof AccountDeletionError
        && error.code === 'invalid-argument',
    );
    assert.equal(touched, false);
  });

  it('deletes server data before the Firebase Auth identity', async () => {
    const order: string[] = [];
    const service = new AccountDeletionService(
      {
        async deleteAccountData(uid, deletedAt) {
          order.push(`data:${uid}:${deletedAt}`);
          return { deletedGroups: 1, deletedMemberships: 1 };
        },
      },
      {
        async deleteUser(uid) {
          order.push(`auth:${uid}`);
        },
      },
      { now: () => 1_720_000_000_000 },
    );

    const result = await service.deleteAccount({
      uid: 'user-1',
      confirmation: 'DELETE',
    });
    assert.deepEqual(order, [
      'data:user-1:1720000000000',
      'auth:user-1',
    ]);
    assert.deepEqual(result, {
      deleted: true,
      deletedGroups: 1,
      deletedMemberships: 1,
    });
  });

  it('treats an already missing Auth identity as an idempotent retry', async () => {
    const service = new AccountDeletionService(
      {
        async deleteAccountData() {
          return { deletedGroups: 0, deletedMemberships: 0 };
        },
      },
      {
        async deleteUser() {
          throw { code: 'auth/user-not-found' };
        },
      },
    );

    await assert.doesNotReject(
      service.deleteAccount({ uid: 'user-1', confirmation: 'DELETE' }),
    );
  });
});
