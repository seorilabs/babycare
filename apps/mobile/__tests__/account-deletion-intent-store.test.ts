import AsyncStorage from '@react-native-async-storage/async-storage';
import {userId} from '@babycare/product-core';

import {AccountDeletionIntentStore} from '../src/app/account-deletion-intent-store';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('AccountDeletionIntentStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists the user before a destructive server request', async () => {
    const store = new AccountDeletionIntentStore();
    await store.save({userId: userId('user-1')});

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@babycare/account-deletion-intent/v1',
      JSON.stringify({userId: 'user-1'}),
    );
  });

  it('restores a valid pending deletion and rejects corrupted state', async () => {
    const store = new AccountDeletionIntentStore();
    jest
      .mocked(AsyncStorage.getItem)
      .mockResolvedValueOnce(JSON.stringify({userId: 'user-1'}));
    await expect(store.load()).resolves.toEqual({userId: 'user-1'});

    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{broken');
    await expect(store.load()).rejects.toThrow('intent is invalid');
  });

  it('clears only the deletion marker after successful private-data cleanup', async () => {
    const store = new AccountDeletionIntentStore();
    await store.clear();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      '@babycare/account-deletion-intent/v1',
    );
  });
});
