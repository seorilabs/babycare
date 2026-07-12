import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
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

export class FirebaseAuthAdapter implements AuthPort {
  readonly #auth: Auth;

  constructor(auth: Auth) {
    this.#auth = auth;
  }

  async currentUser(): Promise<AuthIdentity | undefined> {
    return toIdentity(this.#auth.currentUser);
  }

  async signInAnonymously(): Promise<AuthIdentity> {
    // RNFirebase 25 modular functions intentionally receive the Auth instance.
    const credential = await signInAnonymously(this.#auth);
    return toIdentity(credential.user)!;
  }

  async signOut(): Promise<void> {
    await signOut(this.#auth);
  }

  observe(listener: (identity: AuthIdentity | undefined) => void): () => void {
    return onAuthStateChanged(this.#auth, user => listener(toIdentity(user)));
  }
}
