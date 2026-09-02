import {canPerformGroupAction, type Membership} from '../domain/care-group.ts';
import type {GroupId, UserId} from '../domain/ids.ts';

/**
 * Owner-only member removal. The domain rule (`canPerformGroupAction`) decides
 * authority; this use case adds the two invariants the UI must never bypass:
 * the owner cannot remove themselves, and a missing target is an error rather
 * than a silent success (so the caller can refresh a stale member list).
 */
export type RemoveGroupMemberRejection =
  | 'not_owner'
  | 'self_removal'
  | 'member_not_found';

export class RemoveGroupMemberError extends Error {
  readonly reason: RemoveGroupMemberRejection;

  constructor(reason: RemoveGroupMemberRejection) {
    super(`Group member removal rejected: ${reason}`);
    this.name = 'RemoveGroupMemberError';
    this.reason = reason;
  }
}

export interface RemoveGroupMemberDependencies {
  readonly findMembership: (
    groupId: GroupId,
    userId: UserId,
  ) => Promise<Membership | undefined>;
  readonly removeMembership: (groupId: GroupId, userId: UserId) => Promise<void>;
}

export interface RemoveGroupMemberInput {
  readonly groupId: GroupId;
  readonly actorId: UserId;
  readonly targetId: UserId;
}

export function createRemoveGroupMember(deps: RemoveGroupMemberDependencies) {
  return async function removeGroupMember(
    input: RemoveGroupMemberInput,
  ): Promise<void> {
    if (input.targetId === input.actorId) {
      throw new RemoveGroupMemberError('self_removal');
    }
    const actor = await deps.findMembership(input.groupId, input.actorId);
    if (!canPerformGroupAction(actor, 'remove_member')) {
      throw new RemoveGroupMemberError('not_owner');
    }
    const target = await deps.findMembership(input.groupId, input.targetId);
    if (!target) {
      throw new RemoveGroupMemberError('member_not_found');
    }
    await deps.removeMembership(input.groupId, input.targetId);
  };
}
