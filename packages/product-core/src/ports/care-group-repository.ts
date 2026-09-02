import type { Baby } from '../domain/baby.ts';
import type { CareGroup, Membership } from '../domain/care-group.ts';
import type { GroupId, UserId } from '../domain/ids.ts';

export interface CareGroupSetup {
  readonly group: CareGroup;
  readonly ownerMembership: Membership;
  readonly baby: Baby;
}

export type MembershipObservation =
  | {readonly kind: 'server_value'; readonly membership: Membership | undefined}
  | {readonly kind: 'error'; readonly error: Error};

export interface CareGroupRepositoryPort {
  createOwnerGroup(setup: CareGroupSetup): Promise<void>;
  findById(groupId: GroupId): Promise<CareGroup | undefined>;
  /** Authoritative membership-backed group list; do not satisfy from stale cache. */
  listForUser(userId: UserId): Promise<readonly CareGroup[]>;
  findMembership(groupId: GroupId, userId: UserId): Promise<Membership | undefined>;
  observeMembership(
    groupId: GroupId,
    userId: UserId,
    listener: (observation: MembershipObservation) => void,
  ): () => void;
  listMemberships(groupId: GroupId): Promise<readonly Membership[]>;
  /** Owner-only removal is enforced by the remove-group-member use case and server rules. */
  removeMembership(groupId: GroupId, userId: UserId): Promise<void>;
}
