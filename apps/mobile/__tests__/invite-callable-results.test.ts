import {userId} from '@babycare/product-core';

import {
  decodeAcceptInviteResult,
  decodeCreateInviteResult,
} from '../src/adapters/firebase/invite-callable-results';

describe('Firebase invite callable result mapper', () => {
  const currentUser = userId('user-1');

  it('decodes path- and actor-bound invite results', () => {
    const invite = decodeCreateInviteResult({
      requestedBy: currentUser,
      expectedGroupId: 'group-1',
      value: {
        inviteId: 'a'.repeat(64),
        groupId: 'group-1',
        code: 'AB23CD',
        createdAt: 1_000,
        expiresAt: 2_000,
      },
    });
    expect(invite.code).toBe('AB23CD');
    expect(invite.invitedBy).toBe(currentUser);
  });

  it('rejects mismatched groups and ambiguous codes', () => {
    const base = {
      inviteId: 'a'.repeat(64),
      groupId: 'group-2',
      code: 'AB23CD',
      createdAt: 1_000,
      expiresAt: 2_000,
    };
    expect(() =>
      decodeCreateInviteResult({
        requestedBy: currentUser,
        expectedGroupId: 'group-1',
        value: base,
      }),
    ).toThrow(/group/);
    expect(() =>
      decodeCreateInviteResult({
        requestedBy: currentUser,
        expectedGroupId: 'group-2',
        value: {...base, code: 'AB10IO'},
      }),
    ).toThrow(/unambiguous/);
  });

  it('decodes membership and rejects a forged recipient', () => {
    const value = {
      userId: 'user-1',
      groupId: 'group-1',
      caregiverRole: 'other',
      membershipRole: 'member',
      displayName: '할머니',
      color: '#5FB49C',
      joinedAt: 1_000,
    };
    expect(
      decodeAcceptInviteResult({value, expectedUserId: currentUser}),
    ).toMatchObject({displayName: '할머니', groupId: 'group-1'});
    expect(() =>
      decodeAcceptInviteResult({value, expectedUserId: userId('user-2')}),
    ).toThrow(/user/);
  });
});
