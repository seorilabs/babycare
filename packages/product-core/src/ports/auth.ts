import type { UserId } from '../domain/ids.ts';

export interface AuthIdentity {
  readonly userId: UserId;
  readonly displayName: string;
  readonly isAnonymous: boolean;
}

export interface AuthPort {
  currentUser(): Promise<AuthIdentity | undefined>;
  /** Forces an authoritative identity/token check instead of local cache only. */
  verifyCurrentUser(): Promise<AuthIdentity | undefined>;
  /** Creates an account-free session through the app target's trusted auth bridge. */
  signInWithoutAccount(): Promise<AuthIdentity>;
  signOut(): Promise<void>;
  observe(listener: (identity: AuthIdentity | undefined) => void): () => void;
}
