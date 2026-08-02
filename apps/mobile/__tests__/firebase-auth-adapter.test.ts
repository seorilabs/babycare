import {
  getIdToken,
  reload,
  signInAnonymously,
  signInWithCustomToken,
  signOut,
} from '@react-native-firebase/auth';

import {FirebaseAuthAdapter} from '../src/adapters/firebase/firebase-auth-adapter';

jest.mock('@react-native-firebase/auth', () => ({
  getIdToken: jest.fn(async () => 'refreshed-token'),
  onAuthStateChanged: jest.fn(),
  reload: jest.fn(async () => undefined),
  signInAnonymously: jest.fn(),
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(async () => undefined),
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

describe('FirebaseAuthAdapter platform custom token bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getIdToken as jest.MockedFunction<typeof getIdToken>).mockResolvedValue(
      'legacy-id-token',
    );
  });

  it('preserves a legacy anonymous uid while switching to a custom token', async () => {
    const legacyUser = { ...firebaseUser, isAnonymous: true };
    const bridgedUser = { ...firebaseUser, isAnonymous: false };
    const bridge = {
      createFirebaseCustomToken: jest.fn(async () => ({
        firebaseCustomToken: 'custom-token',
        appUserId: legacyUser.uid,
      })),
    };
    (
      signInWithCustomToken as jest.MockedFunction<typeof signInWithCustomToken>
    ).mockResolvedValueOnce({ user: bridgedUser } as never);
    const adapter = new FirebaseAuthAdapter(
      { currentUser: legacyUser } as never,
      bridge,
    );

    await expect(adapter.signInWithoutAccount()).resolves.toEqual({
      userId: legacyUser.uid,
      displayName: '보호자',
      isAnonymous: false,
    });
    expect(getIdToken).toHaveBeenCalledWith(legacyUser, true);
    expect(bridge.createFirebaseCustomToken).toHaveBeenCalledWith({
      existingFirebaseIdToken: 'legacy-id-token',
    });
    expect(signInWithCustomToken).toHaveBeenCalledWith(
      expect.anything(),
      'custom-token',
    );
  });

  it('creates a new server uid when Firebase has no current user', async () => {
    const bridgedUser = { ...firebaseUser, uid: 'pb-new-user' };
    const bridge = {
      createFirebaseCustomToken: jest.fn(async () => ({
        firebaseCustomToken: 'custom-token',
        appUserId: bridgedUser.uid,
      })),
    };
    (
      signInWithCustomToken as jest.MockedFunction<typeof signInWithCustomToken>
    ).mockResolvedValueOnce({ user: bridgedUser } as never);
    const adapter = new FirebaseAuthAdapter(
      { currentUser: null } as never,
      bridge,
    );

    await expect(adapter.signInWithoutAccount()).resolves.toMatchObject({
      userId: bridgedUser.uid,
    });
    expect(bridge.createFirebaseCustomToken).toHaveBeenCalledWith({});
    expect(getIdToken).not.toHaveBeenCalled();
  });

  it('fails closed before Firebase sign-in when the bridge changes a legacy uid', async () => {
    const legacyUser = { ...firebaseUser, isAnonymous: true };
    const bridge = {
      createFirebaseCustomToken: jest.fn(async () => ({
        firebaseCustomToken: 'custom-token',
        appUserId: 'different-user',
      })),
    };
    const adapter = new FirebaseAuthAdapter(
      { currentUser: legacyUser } as never,
      bridge,
    );

    await expect(adapter.signInWithoutAccount()).rejects.toThrow(
      'changed the existing Firebase uid',
    );
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps direct anonymous sign-in limited to the emulator adapter', async () => {
    const emulatorUser = {
      ...firebaseUser,
      uid: 'emulator-user',
      isAnonymous: true,
    };
    (
      signInAnonymously as jest.MockedFunction<typeof signInAnonymously>
    ).mockResolvedValueOnce({ user: emulatorUser } as never);
    const adapter = new FirebaseAuthAdapter(
      { currentUser: null } as never,
      undefined,
      true,
    );

    await expect(adapter.signInWithoutAccount()).resolves.toMatchObject({
      userId: emulatorUser.uid,
      isAnonymous: true,
    });
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });
});
