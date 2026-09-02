import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  createRemoveGroupMember,
  groupId,
  userId,
  RemoveGroupMemberError,
  type Membership,
} from '../src/index.ts';

const GROUP = groupId('group-1');
const OWNER = userId('owner-1');
const MEMBER = userId('member-1');

function membership(
  user: ReturnType<typeof userId>,
  membershipRole: Membership['membershipRole'],
): Membership {
  return {
    userId: user,
    groupId: GROUP,
    caregiverRole: 'parent',
    membershipRole,
    displayName: '보호자',
    color: '#5FB49C',
    joinedAt: 1_720_000_000_000,
  };
}

function repositoryDouble(rows: readonly Membership[]) {
  const removed: string[] = [];
  return {
    removed,
    findMembership: async (_group: typeof GROUP, user: ReturnType<typeof userId>) =>
      rows.find(row => row.userId === user),
    removeMembership: async (_group: typeof GROUP, user: ReturnType<typeof userId>) => {
      removed.push(user);
    },
  };
}

describe('removeGroupMember', () => {
  it('소유자는 자신이 아닌 구성원을 내보낼 수 있다', async () => {
    const repository = repositoryDouble([
      membership(OWNER, 'owner'),
      membership(MEMBER, 'member'),
    ]);
    const removeGroupMember = createRemoveGroupMember(repository);

    await removeGroupMember({groupId: GROUP, actorId: OWNER, targetId: MEMBER});

    assert.deepEqual(repository.removed, [MEMBER]);
  });

  it('비소유자의 내보내기 요청은 거부된다', async () => {
    const repository = repositoryDouble([
      membership(OWNER, 'owner'),
      membership(MEMBER, 'member'),
    ]);
    const removeGroupMember = createRemoveGroupMember(repository);

    await assert.rejects(
      removeGroupMember({groupId: GROUP, actorId: MEMBER, targetId: OWNER}),
      (error: unknown) =>
        error instanceof RemoveGroupMemberError && error.reason === 'not_owner',
    );
    assert.deepEqual(repository.removed, []);
  });

  it('멤버십이 없는 요청자도 거부된다', async () => {
    const repository = repositoryDouble([membership(MEMBER, 'member')]);
    const removeGroupMember = createRemoveGroupMember(repository);

    await assert.rejects(
      removeGroupMember({
        groupId: GROUP,
        actorId: userId('outsider-1'),
        targetId: MEMBER,
      }),
      (error: unknown) =>
        error instanceof RemoveGroupMemberError && error.reason === 'not_owner',
    );
    assert.deepEqual(repository.removed, []);
  });

  it('소유자 자신을 대상으로 한 내보내기는 거부된다', async () => {
    const repository = repositoryDouble([membership(OWNER, 'owner')]);
    const removeGroupMember = createRemoveGroupMember(repository);

    await assert.rejects(
      removeGroupMember({groupId: GROUP, actorId: OWNER, targetId: OWNER}),
      (error: unknown) =>
        error instanceof RemoveGroupMemberError &&
        error.reason === 'self_removal',
    );
    assert.deepEqual(repository.removed, []);
  });

  it('이미 사라진 구성원은 오류로 알려 목록 갱신을 유도한다', async () => {
    const repository = repositoryDouble([membership(OWNER, 'owner')]);
    const removeGroupMember = createRemoveGroupMember(repository);

    await assert.rejects(
      removeGroupMember({groupId: GROUP, actorId: OWNER, targetId: MEMBER}),
      (error: unknown) =>
        error instanceof RemoveGroupMemberError &&
        error.reason === 'member_not_found',
    );
    assert.deepEqual(repository.removed, []);
  });
});
