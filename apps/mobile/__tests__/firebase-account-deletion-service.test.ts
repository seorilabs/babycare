import {httpsCallable} from '@react-native-firebase/functions';
import {getIdToken} from '@react-native-firebase/auth';
import {userId, type AuthPort} from '@babycare/product-core';

import {FirebaseAccountDeletionService} from '../src/adapters/firebase/firebase-account-deletion-service';

jest.mock('@react-native-firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getIdToken: jest.fn(async () => 'firebase-id-token'),
}));

function auth(identity = userId('user-1')): AuthPort {
  return {
    currentUser: jest.fn(),
    verifyCurrentUser: jest.fn(async () => ({
      userId: identity,
      displayName: '보호자',
      isAnonymous: false,
    })),
    signInWithoutAccount: jest.fn(),
    signOut: jest.fn(),
    observe: jest.fn(),
  };
}

describe('FirebaseAccountDeletionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies the current identity and sends only the explicit confirmation', async () => {
    const callable = jest.fn(async () => ({data: {deleted: true}}));
    (httpsCallable as jest.MockedFunction<typeof httpsCallable>).mockReturnValue(
      callable as never,
    );
    const currentAuth = auth();
    const service = new FirebaseAccountDeletionService({} as never, currentAuth);

    await expect(
      service.deleteAccount({userId: userId('user-1'), confirmation: 'DELETE'}),
    ).resolves.toBeUndefined();
    expect(currentAuth.verifyCurrentUser).toHaveBeenCalledTimes(1);
    expect(callable).toHaveBeenCalledWith({confirmation: 'DELETE'});
  });

  it('fails closed before the callable when the identity changed', async () => {
    const callable = jest.fn();
    (httpsCallable as jest.MockedFunction<typeof httpsCallable>).mockReturnValue(
      callable as never,
    );
    const service = new FirebaseAccountDeletionService(
      {} as never,
      auth(userId('different-user')),
    );

    await expect(
      service.deleteAccount({userId: userId('user-1'), confirmation: 'DELETE'}),
    ).rejects.toThrow('does not match');
    expect(callable).not.toHaveBeenCalled();
  });

  it('rejects a malformed success response', async () => {
    const callable = jest.fn(async () => ({data: {deleted: false}}));
    (httpsCallable as jest.MockedFunction<typeof httpsCallable>).mockReturnValue(
      callable as never,
    );
    const service = new FirebaseAccountDeletionService({} as never, auth());

    await expect(
      service.deleteAccount({userId: userId('user-1'), confirmation: 'DELETE'}),
    ).rejects.toThrow('response is invalid');
  });

  it('deletes the Platform mapping before Firebase data and Auth', async () => {
    const order: string[] = [];
    const callable = jest.fn(async () => {
      order.push('firebase');
      return {data: {deleted: true}};
    });
    (httpsCallable as jest.MockedFunction<typeof httpsCallable>).mockReturnValue(
      callable as never,
    );
    const platform = {
      createFirebaseCustomToken: jest.fn(),
      deleteFirebaseAccount: jest.fn(async () => {
        order.push('platform');
      }),
    };
    const nativeUser = {uid: 'user-1'};
    const service = new FirebaseAccountDeletionService(
      {} as never,
      auth(),
      {currentUser: nativeUser} as never,
      platform,
    );

    await service.deleteAccount({
      userId: userId('user-1'),
      confirmation: 'DELETE',
    });

    expect(getIdToken).toHaveBeenCalledWith(nativeUser, true);
    expect(platform.deleteFirebaseAccount).toHaveBeenCalledWith({
      firebaseIdToken: 'firebase-id-token',
    });
    expect(order).toEqual(['platform', 'firebase']);
  });

  it('accepts a lost callable response after Auth deletion is confirmed', async () => {
    const callable = jest.fn(async () => {
      throw new Error('response lost');
    });
    (httpsCallable as jest.MockedFunction<typeof httpsCallable>).mockReturnValue(
      callable as never,
    );
    const currentAuth = auth();
    jest
      .mocked(currentAuth.verifyCurrentUser)
      .mockResolvedValueOnce({
        userId: userId('user-1'),
        displayName: '보호자',
        isAnonymous: false,
      })
      .mockResolvedValueOnce(undefined);
    const service = new FirebaseAccountDeletionService({} as never, currentAuth);

    await expect(
      service.deleteAccount({
        userId: userId('user-1'),
        confirmation: 'DELETE',
      }),
    ).resolves.toBeUndefined();
  });
});
