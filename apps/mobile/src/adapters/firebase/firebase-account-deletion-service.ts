import {getIdToken, type Auth} from '@react-native-firebase/auth';
import {
  httpsCallable,
  type Functions,
  type HttpsCallable,
} from '@react-native-firebase/functions';
import type {AccountDeletionPort, AuthPort} from '@babycare/product-core';

import type {FirebaseCustomTokenBridge} from '../platform/platform-firebase-custom-token-bridge';

interface DeleteAccountRequest {
  readonly confirmation: 'DELETE';
}

function assertDeletedResponse(value: unknown): void {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('deleted' in value) ||
    value.deleted !== true
  ) {
    throw new Error('Account deletion response is invalid');
  }
}

export class FirebaseAccountDeletionService implements AccountDeletionPort {
  readonly #auth: AuthPort;
  readonly #nativeAuth?: Auth;
  readonly #platform?: FirebaseCustomTokenBridge;
  readonly #delete: HttpsCallable<DeleteAccountRequest, unknown>;

  constructor(
    functions: Functions,
    auth: AuthPort,
    nativeAuth?: Auth,
    platform?: FirebaseCustomTokenBridge,
  ) {
    this.#auth = auth;
    this.#nativeAuth = nativeAuth;
    this.#platform = platform;
    this.#delete = httpsCallable<DeleteAccountRequest, unknown>(
      functions,
      'deleteAccount',
    );
  }

  async deleteAccount(
    input: Parameters<AccountDeletionPort['deleteAccount']>[0],
  ): Promise<void> {
    const identity = await this.#auth.verifyCurrentUser();
    if (!identity || identity.userId !== input.userId) {
      throw new Error('Authenticated user does not match the deleted account');
    }
    if (this.#nativeAuth && this.#platform?.deleteFirebaseAccount) {
      const currentUser = this.#nativeAuth.currentUser;
      if (!currentUser || currentUser.uid !== input.userId) {
        throw new Error('Firebase user does not match the deleted account');
      }
      const firebaseIdToken = await getIdToken(currentUser, true);
      await this.#platform.deleteFirebaseAccount({firebaseIdToken});
    }
    try {
      const response = await this.#delete({confirmation: input.confirmation});
      assertDeletedResponse(response.data);
    } catch (error) {
      // Auth may have been deleted while the callable response was lost.
      // A second authoritative read makes that outcome idempotent.
      const afterFailure = await this.#auth.verifyCurrentUser();
      if (!afterFailure) {
        return;
      }
      throw error;
    }
  }
}
