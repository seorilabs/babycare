import { AccountDeletionError } from './account-deletion-error.js';

export interface AccountDataDeletionResult {
  readonly deletedGroups: number;
  readonly deletedMemberships: number;
}

export interface AccountDataDeletionRepository {
  deleteAccountData(uid: string, deletedAt: number): Promise<AccountDataDeletionResult>;
}

export interface AccountIdentityRepository {
  deleteUser(uid: string): Promise<void>;
}

export interface AccountDeletionClock {
  now(): number;
}

export function requireDeletionConfirmation(value: unknown): void {
  if (value !== 'DELETE') {
    throw new AccountDeletionError(
      'invalid-argument',
      'Account deletion confirmation is invalid',
    );
  }
}

function isMissingAuthUser(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && String(error.code).endsWith('user-not-found'),
  );
}

export class AccountDeletionService {
  constructor(
    private readonly data: AccountDataDeletionRepository,
    private readonly identities: AccountIdentityRepository,
    private readonly clock: AccountDeletionClock = { now: Date.now },
  ) {}

  async deleteAccount(input: {
    readonly uid: string;
    readonly confirmation: unknown;
  }): Promise<AccountDataDeletionResult & { readonly deleted: true }> {
    requireDeletionConfirmation(input.confirmation);
    const result = await this.data.deleteAccountData(input.uid, this.clock.now());
    try {
      await this.identities.deleteUser(input.uid);
    } catch (error) {
      if (!isMissingAuthUser(error)) {
        throw error;
      }
    }
    return { deleted: true, ...result };
  }
}
