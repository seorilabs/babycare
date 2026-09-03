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
const INVITE_CODE_CHAR = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;
const INVITE_CODE_LENGTH = 6;

export function inviteCode(value: string): InviteCode {
  const normalized = value.trim().toUpperCase();
  if (!INVITE_CODE.test(normalized)) {
    throw new Error('Invite code must contain six unambiguous uppercase letters or numbers');
  }
  return normalized as InviteCode;
}

/**
 * Pulls a 6-character invite code out of arbitrary input, not just a raw
 * keystroke. A pasted invite message carries Korean copy, punctuation, and
 * store URLs around the code; this keeps only the code alphabet, in order,
 * and takes the first six matches so the real code (which always comes
 * first in the shared message) wins over anything after it.
 */
export function sanitizeInviteCodeInput(raw: string): string {
  const matches = raw.toUpperCase().match(INVITE_CODE_CHAR);
  return (matches ?? []).join('').slice(0, INVITE_CODE_LENGTH);
}

/**
 * A single keystroke can only grow the sanitized code by one raw character
 * at a time (the rest of the field was already sanitized), so any input
 * longer than that must be a paste or autofill. Used to decide whether a
 * failed extraction deserves a "no code found" hint instead of just being
 * read as normal in-progress typing.
 */
export function looksLikeInviteCodePaste(raw: string): boolean {
  return raw.length > INVITE_CODE_LENGTH + 1;
}

export function isInviteUsable(invite: CareGroupInvite, now: number): boolean {
  return invite.acceptedAt === undefined && invite.expiresAt > now;
}
