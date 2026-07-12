export type InviteErrorCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'permission-denied'
  | 'not-found'
  | 'already-exists'
  | 'failed-precondition'
  | 'resource-exhausted'
  | 'code-collision'
  | 'internal';

export class InviteServiceError extends Error {
  constructor(
    readonly code: InviteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InviteServiceError';
  }
}

export function isInviteServiceError(error: unknown): error is InviteServiceError {
  return error instanceof InviteServiceError;
}
