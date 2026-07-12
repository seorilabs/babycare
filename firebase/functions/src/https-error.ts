import { HttpsError } from 'firebase-functions/v2/https';

import { isInviteServiceError } from './invite-error.js';

export function toInviteHttpsError(
  error: unknown,
  action: 'create' | 'accept',
): HttpsError {
  if (!isInviteServiceError(error)) {
    return new HttpsError('internal', 'Invite operation failed');
  }

  if (error.code === 'unauthenticated') {
    return new HttpsError('unauthenticated', 'Authentication is required');
  }
  if (error.code === 'invalid-argument') {
    return new HttpsError('invalid-argument', error.message);
  }
  if (error.code === 'resource-exhausted') {
    return new HttpsError('resource-exhausted', 'Invite request rate limit exceeded');
  }

  // acceptInvite는 code 존재·만료·사용·멤버십 상태를 외부에 구분해 노출하지 않는다.
  if (action === 'accept') {
    return new HttpsError('failed-precondition', 'Invite is invalid or unavailable');
  }
  if (error.code === 'permission-denied') {
    return new HttpsError('permission-denied', 'Only the group owner can create invites');
  }

  return new HttpsError('internal', 'Invite operation failed');
}
