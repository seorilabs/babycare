export type CaregiverRole =
  | 'parent'
  | 'grandparent'
  | 'sitter'
  | 'teacher'
  | 'other';

export type InviteRateAction = 'invite-create' | 'invite-accept';

export interface InviteRecord {
  readonly inviteId: string;
  readonly codeHash: string;
  readonly groupId: string;
  readonly createdByUid: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly status: 'active' | 'accepted';
  readonly acceptedAt?: number;
  readonly acceptedByUid?: string;
}

export interface MembershipRecord {
  readonly userId: string;
  readonly groupId: string;
  readonly caregiverRole: CaregiverRole;
  readonly membershipRole: 'member';
  readonly displayName: string;
  readonly color: string;
  readonly joinedAt: number;
}

export interface InviteRepository {
  consumeRateLimit(input: {
    readonly uid: string;
    readonly action: InviteRateAction;
    readonly now: number;
    readonly limit: number;
    readonly windowMs: number;
  }): Promise<void>;
  createInvite(input: {
    readonly requestedByUid: string;
    readonly record: InviteRecord;
  }): Promise<void>;
  acceptInvite(input: {
    readonly codeHash: string;
    readonly acceptedByUid: string;
    readonly displayName: string;
    readonly caregiverRole: CaregiverRole;
    readonly color: string;
    readonly now: number;
  }): Promise<MembershipRecord>;
}

export interface Clock {
  now(): number;
}

export interface InviteCodeGenerator {
  generate(): string;
}
