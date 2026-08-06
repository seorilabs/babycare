export type AccountDeletionErrorCode =
  | 'invalid-argument'
  | 'failed-precondition'
  | 'internal';

export class AccountDeletionError extends Error {
  constructor(
    readonly code: AccountDeletionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}
