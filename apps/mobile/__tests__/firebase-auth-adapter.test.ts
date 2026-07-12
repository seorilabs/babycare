import {
  getIdToken,
  reload,
} from '@react-native-firebase/auth';

import {FirebaseAuthAdapter} from '../src/adapters/firebase/firebase-auth-adapter';

jest.mock('@react-native-firebase/auth', () => ({
  getIdToken: jest.fn(async () => 'refreshed-token'),
  onAuthStateChanged: jest.fn(),
  reload: jest.fn(async () => undefined),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
}));

const firebaseUser = {
  uid: 'user-1',
  displayName: '보호자',
  isAnonymous: false,
};

describe('FirebaseAuthAdapter authoritative verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reloads the user and forces an ID-token refresh', async () => {
    const adapter = new FirebaseAuthAdapter({
      currentUser: firebaseUser,
    } as never);

    await expect(adapter.verifyCurrentUser()).resolves.toMatchObject({
      userId: 'user-1',
    });
    expect(reload).toHaveBeenCalledWith(firebaseUser);
    expect(getIdToken).toHaveBeenCalledWith(firebaseUser, true);
  });

  it.each([
    'auth/id-token-revoked',
    'auth/invalid-user-token',
    'auth/user-disabled',
    'auth/user-not-found',
    'auth/user-token-expired',
  ])(
    'treats %s as a revoked server identity',
    async code => {
      (reload as jest.MockedFunction<typeof reload>).mockRejectedValueOnce({
        code,
      });
      const adapter = new FirebaseAuthAdapter({
        currentUser: firebaseUser,
      } as never);

      await expect(adapter.verifyCurrentUser()).resolves.toBeUndefined();
      expect(getIdToken).not.toHaveBeenCalled();
    },
  );

  it('surfaces a network verification failure without declaring revocation', async () => {
    const error = {code: 'auth/network-request-failed'};
    (reload as jest.MockedFunction<typeof reload>).mockRejectedValueOnce(error);
    const adapter = new FirebaseAuthAdapter({
      currentUser: firebaseUser,
    } as never);

    await expect(adapter.verifyCurrentUser()).rejects.toBe(error);
  });
});
