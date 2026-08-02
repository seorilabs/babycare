import {
  getIdToken,
  onAuthStateChanged,
  reload,
  signInAnonymously,
  signInWithCustomToken,
  signOut,
  type Auth,
  type User,
} from '@react-native-firebase/auth';
import {userId, type AuthIdentity, type AuthPort} from '@babycare/product-core';

import type {FirebaseCustomTokenBridge} from '../platform/platform-firebase-custom-token-bridge';

function toIdentity(user: User | null): AuthIdentity | undefined {
  if (!user) {
    return undefined;
  }
  return {
    userId: userId(user.uid),
    displayName: user.displayName?.trim() || '양육자',
    isAnonymous: user.isAnonymous,
  };
}

function isRevokedIdentityError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  return [
    'auth/id-token-revoked',
    'auth/invalid-user-token',
    'auth/user-disabled',
    'auth/user-not-found',
    'auth/user-token-expired',
  ].some(value => code.endsWith(value));
}

export class FirebaseAuthAdapter implements AuthPort {
  readonly #auth: Auth;
  readonly #bridge?: FirebaseCustomTokenBridge;
  readonly #allowEmulatorAnonymous: boolean;

  constructor(
    auth: Auth,
    bridge?: FirebaseCustomTokenBridge,
    allowEmulatorAnonymous = false,
  ) {
    this.#auth = auth;
    this.#bridge = bridge;
    this.#allowEmulatorAnonymous = allowEmulatorAnonymous;
  }

  async currentUser(): Promise<AuthIdentity | undefined> {
    return toIdentity(this.#auth.currentUser);
  }

  async verifyCurrentUser(): Promise<AuthIdentity | undefined> {
    const current = this.#auth.currentUser;
    if (!current) {
      return undefined;
    }
    try {
      await reload(current);
      await getIdToken(current, true);
    } catch (error) {
      if (isRevokedIdentityError(error)) {
        return undefined;
      }
      throw error;
    }
    return toIdentity(this.#auth.currentUser);
  }

  async signInWithoutAccount(): Promise<AuthIdentity> {
    const current = this.#auth.currentUser;
    if (current && !current.isAnonymous) {
      return toIdentity(current)!;
    }

    if (!this.#bridge) {
      if (!this.#allowEmulatorAnonymous) {
        throw new Error('Firebase custom token bridge is not configured');
      }
      if (current) {
        return toIdentity(current)!;
      }
      const emulatorCredential = await signInAnonymously(this.#auth);
      return toIdentity(emulatorCredential.user as unknown as User)!;
    }

    const existingUid = current?.uid;
    const existingFirebaseIdToken = current
      ? await getIdToken(current, true)
      : undefined;
    const bridgeResult = await this.#bridge.createFirebaseCustomToken({
      ...(existingFirebaseIdToken ? { existingFirebaseIdToken } : {}),
    });
    if (existingUid && bridgeResult.appUserId !== existingUid) {
      throw new Error('Platform auth bridge changed the existing Firebase uid');
    }

    const credential = await signInWithCustomToken(
      this.#auth,
      bridgeResult.firebaseCustomToken,
    );
    if (credential.user.uid !== bridgeResult.appUserId) {
      await signOut(this.#auth);
      throw new Error(
        'Firebase custom token uid did not match the bridge result',
      );
    }
    return toIdentity(credential.user as unknown as User)!;
  }

  async signOut(): Promise<void> {
    await signOut(this.#auth);
  }

  observe(listener: (identity: AuthIdentity | undefined) => void): () => void {
    return onAuthStateChanged(this.#auth, user => listener(toIdentity(user)));
  }
}
