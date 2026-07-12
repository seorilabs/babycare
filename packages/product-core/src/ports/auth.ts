import type { UserId } from '../domain/ids.ts';

export interface AuthIdentity {
  readonly userId: UserId;
  readonly displayName: string;
  readonly isAnonymous: boolean;
}

export interface AuthPort {
  currentUser(): Promise<AuthIdentity | undefined>;
  signInAnonymously(): Promise<AuthIdentity>;
  signOut(): Promise<void>;
  observe(listener: (identity: AuthIdentity | undefined) => void): () => void;
}
