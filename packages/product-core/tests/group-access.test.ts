import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  canPerformGroupAction,
  groupId,
  inviteCode,
  isInviteUsable,
  inviteId,
  userId,
  type CareGroupInvite,
  type Membership,
} from '../src/index.ts';

const member: Membership = {
  userId: userId('user-1'),
  groupId: groupId('group-1'),
  caregiverRole: 'parent',
  membershipRole: 'member',
  displayName: '엄마',
  color: '#4D9F87',
  joinedAt: 1_000,
};

describe('group access', () => {
  it('lets members record but reserves member management for the owner', () => {
    assert.equal(canPerformGroupAction(member, 'read'), true);
    assert.equal(canPerformGroupAction(member, 'record'), true);
    assert.equal(canPerformGroupAction(member, 'invite'), false);
    assert.equal(
      canPerformGroupAction({...member, membershipRole: 'owner'}, 'remove_member'),
      true,
    );
    assert.equal(canPerformGroupAction(undefined, 'read'), false);
  });
});

describe('invite code', () => {
  it('normalizes six-character codes and rejects expired invites', () => {
    const invite: CareGroupInvite = {
      id: inviteId('invite-1'),
      groupId: groupId('group-1'),
      invitedBy: userId('owner-1'),
      code: inviteCode('ab23cd'),
      createdAt: 1_000,
      expiresAt: 2_000,
    };
    assert.equal(invite.code, 'AB23CD');
    assert.equal(isInviteUsable(invite, 1_999), true);
    assert.equal(isInviteUsable(invite, 2_000), false);
    assert.throws(() => inviteCode('AB10IO'), /unambiguous/);
  });
});
