import { createHmac, randomInt } from 'node:crypto';

import { InviteServiceError } from './invite-error.js';

export const SAFE_INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SAFE_INVITE_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const HMAC_DOMAIN = 'babycare:invite-code:v1:';

export function generateSafeInviteCode(): string {
  let result = '';
  for (let index = 0; index < 6; index += 1) {
    result += SAFE_INVITE_ALPHABET[randomInt(0, SAFE_INVITE_ALPHABET.length)];
  }
  return result;
}

export function hashInviteCode(code: string, secret: string): string {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new InviteServiceError(
      'internal',
      'Invite HMAC secret must contain at least 32 bytes',
    );
  }
  return createHmac('sha256', secret)
    .update(`${HMAC_DOMAIN}${code}`)
    .digest('hex');
}
