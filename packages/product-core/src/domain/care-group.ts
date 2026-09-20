import type { BabyId, GroupId, UserId } from './ids.ts';

export type CaregiverRole = 'parent' | 'grandparent' | 'sitter' | 'teacher' | 'other';
export type MembershipRole = 'owner' | 'member';

export interface Membership {
  readonly userId: UserId;
  readonly groupId: GroupId;
  readonly caregiverRole: CaregiverRole;
  readonly membershipRole: MembershipRole;
  readonly displayName: string;
  readonly color: string;
  readonly joinedAt: number;
}

export interface CareGroup {
  readonly id: GroupId;
  readonly name: string;
  readonly ownerId: UserId;
  readonly babyIds: readonly BabyId[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type GroupAction =
  | 'read'
  | 'record'
  | 'invite'
  | 'update_baby_profile'
  | 'remove_member'
  | 'delete_group';

export function canPerformGroupAction(
  membership: Membership | undefined,
  action: GroupAction,
): boolean {
  if (!membership) {
    return false;
  }
  if (action === 'read' || action === 'record') {
    return true;
  }
  return membership.membershipRole === 'owner';
}
