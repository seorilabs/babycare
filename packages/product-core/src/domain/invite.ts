import type { Brand, GroupId, InviteId, UserId } from './ids.ts';

export type InviteCode = Brand<string, 'InviteCode'>;

export interface CareGroupInvite {
  readonly id: InviteId;
  readonly groupId: GroupId;
  readonly invitedBy: UserId;
  readonly code: InviteCode;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly acceptedAt?: number;
  readonly acceptedBy?: UserId;
}

const INVITE_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function inviteCode(value: string): InviteCode {
  const normalized = value.trim().toUpperCase();
  if (!INVITE_CODE.test(normalized)) {
    throw new Error('Invite code must contain six unambiguous uppercase letters or numbers');
  }
  return normalized as InviteCode;
}

export function isInviteUsable(invite: CareGroupInvite, now: number): boolean {
  return invite.acceptedAt === undefined && invite.expiresAt > now;
}
