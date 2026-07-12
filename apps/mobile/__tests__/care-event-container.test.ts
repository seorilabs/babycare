import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  babyId,
  eventId,
  groupId,
  userId,
  type AuthIdentity,
  type AuthPort,
  type Baby,
  type CareEvent,
  type CareEventMutation,
  type CareEventPushResult,
  type CareEventQuery,
  type CareEventRemoteObservation,
  type CareEventRemoteStorePort,
  type CareGroup,
  type EventId,
  type GroupId,
  type Membership,
  type MembershipObservation,
} from '@babycare/product-core';

import type {AuthenticatedCareContext} from '../src/app/care-context';
import {createCareEventContainer} from '../src/app/care-event-container';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

const identity: AuthIdentity = {
  userId: userId('user-container'),
  displayName: '보호자',
  isAnonymous: false,
};
const group: CareGroup = {
  id: groupId('group-container'),
  name: '돌봄 그룹',
  ownerId: identity.userId,
  babyIds: [babyId('baby-container')],
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
  createdAt: 1_000,
  updatedAt: 1_000,
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

  async currentUser(): Promise<AuthIdentity | undefined> {
    return identity;
  }

  async verifyCurrentUser(): Promise<AuthIdentity | undefined> {
    return identity;
  }

  async signInAnonymously(): Promise<AuthIdentity> {
    return identity;
  }

  async signOut(): Promise<void> {
    return undefined;
  }

  observe(listener: (value: AuthIdentity | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class FakeGroups {
  readonly listeners = new Set<
    (observation: MembershipObservation) => void
  >();
  groups: readonly CareGroup[] = [group];
  observeError: Error | undefined;

  observeMembership(
    _groupId: GroupId,
    _userId: string,
    listener: (observation: MembershipObservation) => void,
  ): () => void {
    if (this.observeError) {
      throw this.observeError;
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listForUser(): Promise<readonly CareGroup[]> {
    return this.groups;
  }
}

class FakeRemote implements CareEventRemoteStorePort {
  readonly listeners = new Set<
    (observation: CareEventRemoteObservation) => void
  >();

  async push(mutation: CareEventMutation): Promise<CareEventPushResult> {
    return {kind: 'applied', remote: mutation.event};
  }

  async findById(
    _groupId: GroupId,
    _eventId: EventId,
  ): Promise<CareEvent | undefined> {
    return undefined;
  }

  async list(_query: CareEventQuery): Promise<readonly CareEvent[]> {
    return [];
  }

  observe(
    _query: CareEventQuery,
    listener: (observation: CareEventRemoteObservation) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(observation: CareEventRemoteObservation): void {
    for (const listener of this.listeners) {
      listener(observation);
    }
  }
}

describe('createCareEventContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wires a remote permission denial to session purge and UI revocation', async () => {
    const auth = new FakeAuth();
    const groups = new FakeGroups();
    groups.groups = [];
    const remote = new FakeRemote();
    const onRevoked = jest.fn();
    const onError = jest.fn();
    const container = await createCareEventContainer({
      auth,
      groups,
      context,
      remote,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked,
      onError,
    });
    const stopEvents = container.repository.observe(
      {groupId: group.id, babyId: baby.id},
      () => undefined,
    );

    remote.emit({kind: 'error', error: {code: 'permission_denied'}});
    await container.whenSessionSettled();

    expect(onRevoked).toHaveBeenCalledWith('membership_removed');
    expect(onError).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
    expect(remote.listeners.size).toBe(0);
    expect(auth.listeners.size).toBe(0);
    expect(groups.listeners.size).toBe(0);

    stopEvents();
    container.stopSessionLifecycle();
  });

  it('releases the scoped store when lifecycle startup fails', async () => {
    const auth = new FakeAuth();
    const groups = new FakeGroups();
    const startupError = new Error('membership observer unavailable');
    groups.observeError = startupError;
    const dependencies = {
      auth,
      groups,
      context,
      remote: new FakeRemote(),
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked: jest.fn(),
      onError: jest.fn(),
    };

    await expect(createCareEventContainer(dependencies)).rejects.toBe(
      startupError,
    );
    expect(auth.listeners.size).toBe(0);

    groups.observeError = undefined;
    const restarted = await createCareEventContainer(dependencies);
    expect(auth.listeners.size).toBe(1);

    restarted.stopSessionLifecycle();
    await restarted.purge();
  });

  it('releases the scoped writer on normal teardown without purging cache', async () => {
    const dependencies = {
      auth: new FakeAuth(),
      groups: new FakeGroups(),
      context,
      remote: new FakeRemote(),
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked: jest.fn(),
      onError: jest.fn(),
    };
    const first = await createCareEventContainer(dependencies);

    await first.dispose();

    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    const replacement = await createCareEventContainer(dependencies);
    await replacement.dispose();
  });

  it('drains a pending revocation check before normal teardown closes storage', async () => {
    const auth = new FakeAuth();
    const groups = new FakeGroups();
    let resolveGroups: ((groups: readonly CareGroup[]) => void) | undefined;
    let notifyVerificationStarted: (() => void) | undefined;
    const verificationStarted = new Promise<void>(resolve => {
      notifyVerificationStarted = resolve;
    });
    groups.listForUser = () => {
      notifyVerificationStarted?.();
      return new Promise(resolve => {
        resolveGroups = resolve;
      });
    };
    const remote = new FakeRemote();
    const onRevoked = jest.fn();
    const container = await createCareEventContainer({
      auth,
      groups,
      context,
      remote,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked,
      onError: jest.fn(),
    });
    const stopEvents = container.repository.observe(
      {groupId: group.id, babyId: baby.id},
      () => undefined,
    );

    remote.emit({kind: 'error', error: {code: 'permission_denied'}});
    await verificationStarted;
    const disposing = container.dispose();
    resolveGroups?.([]);
    await disposing;

    expect(onRevoked).toHaveBeenCalledWith('membership_removed');
    expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
    stopEvents();
  });
});
