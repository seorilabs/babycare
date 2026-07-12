import type { Baby } from '../domain/baby.ts';
import type { CareGroup, Membership } from '../domain/care-group.ts';
import type { GroupId, UserId } from '../domain/ids.ts';

export interface CareGroupSetup {
  readonly group: CareGroup;
  readonly ownerMembership: Membership;
  readonly baby: Baby;
}

export interface CareGroupRepositoryPort {
  createOwnerGroup(setup: CareGroupSetup): Promise<void>;
  findById(groupId: GroupId): Promise<CareGroup | undefined>;
  listForUser(userId: UserId): Promise<readonly CareGroup[]>;
  findMembership(groupId: GroupId, userId: UserId): Promise<Membership | undefined>;
  listMemberships(groupId: GroupId): Promise<readonly Membership[]>;
}
