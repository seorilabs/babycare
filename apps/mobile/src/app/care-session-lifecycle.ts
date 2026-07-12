import type {
  AuthIdentity,
  AuthPort,
  CareEventRemoteError,
  CareGroupRepositoryPort,
  Membership,
} from '@babycare/product-core';

import {
  assertAuthenticatedCareContext,
  type AuthenticatedCareContext,
} from './care-context';

export type CareSessionRevocationReason =
  | 'signed_out'
  | 'identity_changed'
  | 'membership_removed';

export interface CareSessionLifecycleDependencies {
  readonly auth: AuthPort;
  readonly groups: Pick<
    CareGroupRepositoryPort,
    'observeMembership' | 'listForUser'
  >;
  readonly context: AuthenticatedCareContext;
  readonly purge: () => Promise<void>;
  readonly onAuthenticationRestored: () => Promise<void>;
  readonly onMembershipRestored?: () => Promise<void>;
  readonly onRevoked: (reason: CareSessionRevocationReason) => void;
  readonly onError: (error: Error) => void;
}

/**
 * Starts only after a verified care context exists. A confirmed sign-out or
 * membership removal stops observers and purges the scoped event envelope
 * before the revoked state is delivered to UI.
 */
export class CareSessionLifecycle {
  readonly #dependencies: CareSessionLifecycleDependencies;
  #stopAuth: (() => void) | undefined;
  #stopMembership: (() => void) | undefined;
  #pending: Promise<void> = Promise.resolve();
  #authenticationRecoveryPhase: 'verifying' | 'restoring' | undefined;
  #membershipRecoveryPhase: 'verifying' | 'restoring' | undefined;
  #revoking = false;
  #started = false;

  constructor(dependencies: CareSessionLifecycleDependencies) {
    assertAuthenticatedCareContext(dependencies.context);
    this.#dependencies = dependencies;
  }

  start(): () => void {
    if (this.#started || this.#revoking) {
      throw new Error('Care session lifecycle cannot be started again');
    }
    this.#started = true;
    let stopAuth: () => void;
    try {
      stopAuth = this.#dependencies.auth.observe(identity =>
        this.#handleIdentity(identity),
      );
    } catch (error) {
      this.#started = false;
      throw error;
    }
    this.#stopAuth = stopAuth;
    if (this.#revoking) {
      stopAuth();
    }

    const context = this.#dependencies.context;
    let stopMembership: () => void;
    try {
      stopMembership = this.#dependencies.groups.observeMembership(
        context.group.id,
        context.identity.userId,
        observation => {
          if (observation.kind === 'server_value') {
            this.#handleMembership(observation.membership);
          } else {
            this.#verifyMembershipAfterError(observation.error);
          }
        },
      );
    } catch (error) {
      stopAuth();
      this.#stopAuth = undefined;
      this.#started = false;
      throw error;
    }
    this.#stopMembership = stopMembership;
    if (this.#revoking) {
      stopMembership();
    }
    return () => this.stop();
  }

  stop(): void {
    this.#stopMembership?.();
    this.#stopAuth?.();
    this.#stopMembership = undefined;
    this.#stopAuth = undefined;
    this.#started = false;
  }

  async whenSettled(): Promise<void> {
    let pending: Promise<void>;
    do {
      pending = this.#pending;
      await pending;
    } while (pending !== this.#pending);
  }

  handleRemoteError(error: CareEventRemoteError): void {
    if (error.code === 'unauthenticated') {
      if (this.#authenticationRecoveryPhase === 'restoring') {
        this.#dependencies.onError(this.#remoteError(error));
        return;
      }
      if (this.#authenticationRecoveryPhase === 'verifying') {
        return;
      }
      this.#verifyIdentityAfterError();
      return;
    }
    if (error.code === 'permission_denied') {
      this.#verifyMembershipAfterError(this.#remoteError(error));
      return;
    }
    this.#dependencies.onError(
      this.#remoteError(error),
    );
  }

  #handleIdentity(identity: AuthIdentity | undefined): void {
    if (!identity) {
      this.#revoke('signed_out');
    } else if (identity.userId !== this.#dependencies.context.identity.userId) {
      this.#revoke('identity_changed');
    }
  }

  #handleMembership(membership: Membership | undefined): void {
    const context = this.#dependencies.context;
    if (
      !membership ||
      membership.userId !== context.identity.userId ||
      membership.groupId !== context.group.id
    ) {
      this.#revoke('membership_removed');
    }
  }

  #remoteError(error: CareEventRemoteError): Error {
    return error.cause instanceof Error
      ? error.cause
      : new Error(`Care event remote operation failed: ${error.code}`);
  }

  #verifyIdentityAfterError(): void {
    if (this.#revoking || this.#authenticationRecoveryPhase !== undefined) {
      return;
    }
    this.#authenticationRecoveryPhase = 'verifying';
    const context = this.#dependencies.context;
    this.#pending = this.#pending.then(async () => {
      try {
        const identity = await this.#dependencies.auth.verifyCurrentUser();
        if (this.#revoking) {
          return;
        }
        if (!identity) {
          this.#revoke('signed_out');
          return;
        }
        if (identity.userId !== context.identity.userId) {
          this.#revoke('identity_changed');
          return;
        }
        if (!this.#started) {
          return;
        }
        this.#authenticationRecoveryPhase = 'restoring';
        await this.#dependencies.onAuthenticationRestored();
      } catch (verificationError) {
        if (this.#revoking || !this.#started) {
          return;
        }
        this.#dependencies.onError(
          verificationError instanceof Error
            ? verificationError
            : new Error('Authentication verification failed'),
        );
        return;
      } finally {
        this.#authenticationRecoveryPhase = undefined;
      }
      // A forced token refresh succeeded and the failed outbox was retried.
    });
  }

  #verifyMembershipAfterError(originalError: Error): void {
    if (this.#revoking) {
      return;
    }
    if (this.#membershipRecoveryPhase === 'verifying') {
      return;
    }
    if (this.#membershipRecoveryPhase === 'restoring') {
      this.#dependencies.onError(originalError);
      return;
    }
    this.#membershipRecoveryPhase = 'verifying';
    const context = this.#dependencies.context;
    this.#pending = this.#pending.then(async () => {
      try {
        try {
          const groups = await this.#dependencies.groups.listForUser(
            context.identity.userId,
          );
          if (this.#revoking) {
            return;
          }
          if (!groups.some(group => group.id === context.group.id)) {
            this.#revoke('membership_removed');
            return;
          }
        } catch (verificationError) {
          if (this.#revoking || !this.#started) {
            return;
          }
          this.#dependencies.onError(
            verificationError instanceof Error
              ? verificationError
              : new Error('Membership verification failed'),
          );
          return;
        }

        if (this.#started && this.#dependencies.onMembershipRestored) {
          this.#membershipRecoveryPhase = 'restoring';
          try {
            await this.#dependencies.onMembershipRestored();
          } catch (recoveryError) {
            if (!this.#revoking && this.#started) {
              this.#dependencies.onError(
                recoveryError instanceof Error
                  ? recoveryError
                  : new Error('Membership recovery failed'),
              );
            }
            return;
          }
        }
        if (this.#started) {
          this.#dependencies.onError(originalError);
        }
      } finally {
        this.#membershipRecoveryPhase = undefined;
      }
    });
  }

  #revoke(reason: CareSessionRevocationReason): void {
    if (this.#revoking) {
      return;
    }
    this.#revoking = true;
    this.stop();
    this.#pending = this.#purgeAndNotify(reason);
  }

  async #purgeAndNotify(reason: CareSessionRevocationReason): Promise<void> {
    try {
      await this.#dependencies.purge();
    } catch (error) {
      try {
        this.#dependencies.onError(
          error instanceof Error
            ? error
            : new Error('Care session cache purge failed'),
        );
      } finally {
        this.#dependencies.onRevoked(reason);
      }
      return;
    }
    this.#dependencies.onRevoked(reason);
  }
}
