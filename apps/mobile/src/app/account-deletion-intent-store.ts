import AsyncStorage from '@react-native-async-storage/async-storage';
import {userId, type UserId} from '@babycare/product-core';

const ACCOUNT_DELETION_INTENT_KEY = '@babycare/account-deletion-intent/v1';

export interface AccountDeletionIntent {
  readonly userId: UserId;
}

export class AccountDeletionIntentStore {
  async load(): Promise<AccountDeletionIntent | undefined> {
    const raw = await AsyncStorage.getItem(ACCOUNT_DELETION_INTENT_KEY);
    if (!raw) {
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('Account deletion intent is invalid');
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      !('userId' in value) ||
      typeof value.userId !== 'string' ||
      !value.userId.trim()
    ) {
      throw new Error('Account deletion intent is invalid');
    }
    return {userId: userId(value.userId)};
  }

  async save(intent: AccountDeletionIntent): Promise<void> {
    await AsyncStorage.setItem(
      ACCOUNT_DELETION_INTENT_KEY,
      JSON.stringify({userId: intent.userId}),
    );
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(ACCOUNT_DELETION_INTENT_KEY);
  }
}
