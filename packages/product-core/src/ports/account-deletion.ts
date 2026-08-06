import type { UserId } from '../domain/ids.ts';

export interface AccountDeletionPort {
  deleteAccount(input: {
    readonly userId: UserId;
    readonly confirmation: 'DELETE';
  }): Promise<void>;
}
