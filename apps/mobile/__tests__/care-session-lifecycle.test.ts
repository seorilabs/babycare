import {
  babyId,
  groupId,
  userId,
  type AuthIdentity,
  type AuthPort,
  type Baby,
  type CareGroup,
  type Membership,
  type MembershipObservation,
} from '@babycare/product-core';

import type {AuthenticatedCareContext} from '../src/app/care-context';
import {CareSessionLifecycle} from '../src/app/care-session-lifecycle';

const identity: AuthIdentity = {
  userId: userId('user-1'),
  displayName: '엄마',
  isAnonymous: false,
};
const group: CareGroup = {
  id: groupId('group-1'),
  name: '하루 돌봄',
  ownerId: identity.userId,
  babyIds: [babyId('baby-1')],
  createdAt: 1_000,
  updatedAt: 1_000,
};
const membership: Membership = {
  userId: identity.userId,
  groupId: group.id,
  caregiverRole: 'parent',
  membershipRole: 'owner',
  displayName: identity.displayName,
  color: '#5FB49C',
  joinedAt: 1_000,
};
const baby: Baby = {
  id: group.babyIds[0],
  groupId: group.id,
  name: '하루',
  birthDate: '2026-01-01',
  sex: 'unspecified',
  createdAt: 2_000_000_000_000,
  updatedAt: 2_000_000_000_000,
};
const context: AuthenticatedCareContext = {
  identity,
  group,
  membership,
  baby,
};

class FakeAuth implements AuthPort {
  readonly listeners = new Set<
    (identity: AuthIdentity | undefined) => void
  >();
  currentIdentity: AuthIdentity | undefined = identity;

  async currentUser(): Promise<AuthIdentity | undefined> {
    return this.currentIdentity;
  }

  async verifyCurrentUser(): Promise<AuthIdentity | undefined> {
    return this.currentIdentity;
  }

  async signInAnonymously(): Promise<AuthIdentity> {
    return identity;
  }

  async signOut(): Promise<void> {
    this.emit(undefined);
  }

  observe(listener: (value: AuthIdentity | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: AuthIdentity | undefined): void {
    for (const listener of this.listeners) {
      listener(value);
    }
  }
}

class FakeGroups {
  readonly listeners = new Set<
    (observation: MembershipObservation) => void
  >();
  groups: readonly CareGroup[] = [group];

  observeMembership(
    _groupId: string,
    _userId: string,
    listener: (observation: MembershipObservation) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listForUser(): Promise<readonly CareGroup[]> {
    return this.groups;
  }

  emit(observation: MembershipObservation): void {
    for (const listener of this.listeners) {
      listener(observation);
    }
  }
}

function setup() {
  const auth = new FakeAuth();
  const groups = new FakeGroups();
  const purge = jest.fn(async () => undefined);
  const onAuthenticationRestored = jest.fn(async () => undefined);
  const onRevoked = jest.fn();
  const onError = jest.fn();
  const lifecycle = new CareSessionLifecycle({
    auth,
    groups,
    context,
    purge,
    onAuthenticationRestored,
    onRevoked,
    onError,
  });
  lifecycle.start();
  return {
    auth,
    groups,
    purge,
    onAuthenticationRestored,
    onRevoked,
    onError,
    lifecycle,
  };
}

describe('CareSessionLifecycle', () => {
  it('stops observers and purges the scoped cache before reporting sign-out', async () => {
    const state = setup();
    state.auth.emit(undefined);
    await state.lifecycle.whenSettled();

    expect(state.auth.listeners.size).toBe(0);
    expect(state.groups.listeners.size).toBe(0);
    expect(state.purge).toHaveBeenCalledTimes(1);
    expect(state.onRevoked).toHaveBeenCalledWith('signed_out');
    expect(state.purge.mock.invocationCallOrder[0]).toBeLessThan(
      state.onRevoked.mock.invocationCallOrder[0],
    );
  });

  it('purges after a server-confirmed membership removal', async () => {
    const state = setup();
    state.groups.emit({kind: 'server_value', membership: undefined});
    await state.lifecycle.whenSettled();

    expect(state.purge).toHaveBeenCalledTimes(1);
    expect(state.onRevoked).toHaveBeenCalledWith('membership_removed');
  });

  it('reports purge failure but still delivers the revoked UI state', async () => {
    const state = setup();
    const purgeError = new Error('secure storage unavailable');
    state.purge.mockRejectedValueOnce(purgeError);

    state.auth.emit(undefined);
    await state.lifecycle.whenSettled();

    expect(state.onError).toHaveBeenCalledWith(purgeError);
    expect(state.onRevoked).toHaveBeenCalledWith('signed_out');
    expect(state.purge.mock.invocationCallOrder[0]).toBeLessThan(
      state.onRevoked.mock.invocationCallOrder[0],
    );
  });

  it('revokes only after a remote permission error confirms membership removal', async () => {
    const removed = setup();
    removed.groups.groups = [];
    removed.lifecycle.handleRemoteError({code: 'permission_denied'});
    await removed.lifecycle.whenSettled();
    expect(removed.purge).toHaveBeenCalledTimes(1);
    expect(removed.onRevoked).toHaveBeenCalledWith('membership_removed');

    const retained = setup();
    const original = new Error('write rejected');
    retained.lifecycle.handleRemoteError({
      code: 'permission_denied',
      cause: original,
    });
    await retained.lifecycle.whenSettled();
    expect(retained.purge).not.toHaveBeenCalled();
    expect(retained.onRevoked).not.toHaveBeenCalled();
    expect(retained.onError).toHaveBeenCalledWith(original);
  });

  it('revokes only after a remote auth error confirms the identity is gone or changed', async () => {
    const signedOut = setup();
    signedOut.auth.currentIdentity = undefined;
    signedOut.lifecycle.handleRemoteError({code: 'unauthenticated'});
    await signedOut.lifecycle.whenSettled();
    expect(signedOut.onRevoked).toHaveBeenCalledWith('signed_out');

    const changed = setup();
    changed.auth.currentIdentity = {
      ...identity,
      userId: userId('user-2'),
    };
    changed.lifecycle.handleRemoteError({code: 'unauthenticated'});
    await changed.lifecycle.whenSettled();
    expect(changed.onRevoked).toHaveBeenCalledWith('identity_changed');

    const retained = setup();
    retained.lifecycle.handleRemoteError({
      code: 'unauthenticated',
      cause: new Error('token refresh pending'),
    });
    await retained.lifecycle.whenSettled();
    expect(retained.purge).not.toHaveBeenCalled();
    expect(retained.onRevoked).not.toHaveBeenCalled();
    expect(retained.onAuthenticationRestored).toHaveBeenCalledTimes(1);
    expect(retained.onError).not.toHaveBeenCalled();
  });

  it('does not recursively retry a second 401 raised by the recovery flush', async () => {
    const state = setup();
    const verifyCurrentUser = jest.spyOn(state.auth, 'verifyCurrentUser');
    const repeatedError = new Error('refreshed token was still rejected');
    state.onAuthenticationRestored.mockImplementationOnce(async () => {
      state.lifecycle.handleRemoteError({
        code: 'unauthenticated',
        cause: repeatedError,
      });
    });

    state.lifecycle.handleRemoteError({code: 'unauthenticated'});
    await state.lifecycle.whenSettled();

    expect(verifyCurrentUser).toHaveBeenCalledTimes(1);
    expect(state.onAuthenticationRestored).toHaveBeenCalledTimes(1);
    expect(state.onError).toHaveBeenCalledTimes(1);
    expect(state.onError).toHaveBeenCalledWith(repeatedError);
    expect(state.onRevoked).not.toHaveBeenCalled();
  });

  it('does not retry a restored identity after normal teardown starts', async () => {
    const state = setup();
    let resolveIdentity: ((value: AuthIdentity) => void) | undefined;
    let notifyVerificationStarted: (() => void) | undefined;
    const verificationStarted = new Promise<void>(resolve => {
      notifyVerificationStarted = resolve;
    });
    jest.spyOn(state.auth, 'verifyCurrentUser').mockImplementationOnce(() => {
      notifyVerificationStarted?.();
      return new Promise(resolve => {
        resolveIdentity = resolve;
      });
    });

    state.lifecycle.handleRemoteError({code: 'unauthenticated'});
    await verificationStarted;
    state.lifecycle.stop();
    resolveIdentity?.(identity);
    await state.lifecycle.whenSettled();

    expect(state.onAuthenticationRestored).not.toHaveBeenCalled();
    expect(state.onError).not.toHaveBeenCalled();
    expect(state.onRevoked).not.toHaveBeenCalled();
  });

  it('verifies an observer error before deciding that access was revoked', async () => {
    const removed = setup();
    removed.groups.groups = [];
    removed.groups.emit({kind: 'error', error: new Error('permission denied')});
    await Promise.resolve();
    await removed.lifecycle.whenSettled();
    expect(removed.onRevoked).toHaveBeenCalledWith('membership_removed');

    const retained = setup();
    const original = new Error('listener restarted');
    retained.groups.emit({kind: 'error', error: original});
    await retained.lifecycle.whenSettled();
    expect(retained.purge).not.toHaveBeenCalled();
    expect(retained.onError).toHaveBeenCalledWith(original);
  });
});
