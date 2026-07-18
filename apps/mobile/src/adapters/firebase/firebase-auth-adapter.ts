import {
  default as firebaseAuth,
  getIdToken,
  onAuthStateChanged,
  reload,
  type Auth,
  type User,
} from '@react-native-firebase/auth';
import {userId, type AuthIdentity, type AuthPort} from '@babycare/product-core';

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

  constructor(auth: Auth) {
    this.#auth = auth;
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

  async signInAnonymously(): Promise<AuthIdentity> {
    const credential = await firebaseAuth(this.#auth.app).signInAnonymously();
    return toIdentity(credential.user as unknown as User)!;
  }

  async signOut(): Promise<void> {
    await firebaseAuth(this.#auth.app).signOut();
  }

  observe(listener: (identity: AuthIdentity | undefined) => void): () => void {
    return onAuthStateChanged(this.#auth, user => listener(toIdentity(user)));
  }
}
