import type { CareGroupInvite, InviteCode } from '../domain/invite.ts';
import type { Membership } from '../domain/care-group.ts';
import type { GroupId, UserId } from '../domain/ids.ts';

export interface InviteServicePort {
  createInvite(input: {
    readonly groupId: GroupId;
    readonly requestedBy: UserId;
  }): Promise<CareGroupInvite>;
  acceptInvite(input: {
    readonly code: InviteCode;
    readonly userId: UserId;
    readonly displayName: string;
  }): Promise<Membership>;
}
