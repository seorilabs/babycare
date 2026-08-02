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
  type CareEventPageRequest,
  type CareEventProjectionScope,
  type CareEventQuery,
  type CareEventRemoteObservation,
  type CareEventRemotePage,
  type CareEventRemotePageObservation,
  type CareEventRemoteStorePort,
  type CareEventWindowObservation,
  type CareEventWindowRequest,
  type CareGroup,
  type EventId,
  type GroupId,
  type Membership,
  type MembershipObservation,
  type LatestCareEventObservation,
  type LatestCareEventRequest,
  type ActiveSleepObservation,
} from '@babycare/product-core';
import {PersistentCareEventSyncStore} from '@babycare/product-data';

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
const timelineConfig = {
  pageSize: 20,
  maxCachedEvents: 100,
  maxScanPagesPerLoad: 3,
} as const;

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

  async signInWithoutAccount(): Promise<AuthIdentity> {
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
  readonly pageListeners = new Set<
    (observation: CareEventRemotePageObservation) => void
  >();
  readonly windowListeners = new Set<
    (observation: CareEventWindowObservation) => void
  >();
  readonly latestListeners = new Set<
    (observation: LatestCareEventObservation) => void
  >();
  readonly activeSleepListeners = new Set<
    (observation: ActiveSleepObservation) => void
  >();
  fetchCount = 0;
  projectionFetchCount = 0;

  async push(mutation: CareEventMutation): Promise<CareEventPushResult> {
    return {kind: 'applied', remote: mutation.event};
  }

  async findById(
    _groupId: GroupId,
    _eventId: EventId,
  ): Promise<CareEvent | undefined> {
    return undefined;
  }

  async fetchWindow(
    _request: CareEventWindowRequest,
  ): Promise<readonly CareEvent[]> {
    this.projectionFetchCount += 1;
    return [];
  }

  observeWindow(
    _request: CareEventWindowRequest,
    listener: (observation: CareEventWindowObservation) => void,
  ): () => void {
    this.windowListeners.add(listener);
    return () => this.windowListeners.delete(listener);
  }

  async fetchLatest(
    _request: LatestCareEventRequest,
  ): Promise<CareEvent | undefined> {
    this.projectionFetchCount += 1;
    return undefined;
  }

  observeLatest(
    _request: LatestCareEventRequest,
    listener: (observation: LatestCareEventObservation) => void,
  ): () => void {
    this.latestListeners.add(listener);
    return () => this.latestListeners.delete(listener);
  }

  async fetchActiveSleep(
    _scope: CareEventProjectionScope,
  ): Promise<undefined> {
    this.projectionFetchCount += 1;
    return undefined;
  }

  observeActiveSleep(
    _scope: CareEventProjectionScope,
    listener: (observation: ActiveSleepObservation) => void,
  ): () => void {
    this.activeSleepListeners.add(listener);
    return () => this.activeSleepListeners.delete(listener);
  }

  async fetchPage(
    _request: CareEventPageRequest,
  ): Promise<CareEventRemotePage> {
    this.fetchCount += 1;
    return {events: [], hasMore: false};
  }

  observePage(
    _request: CareEventPageRequest,
    listener: (observation: CareEventRemotePageObservation) => void,
  ): () => void {
    this.pageListeners.add(listener);
    return () => this.pageListeners.delete(listener);
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

  emitPage(observation: CareEventRemotePageObservation): void {
    for (const listener of this.pageListeners) {
      listener(observation);
    }
  }
}

describe('createCareEventContainer', () => {
  const activeStops = new Set<() => void>();

  function trackStop(stop: () => void): () => void {
    let active = true;
    const tracked = () => {
      if (!active) {
        return;
      }
      active = false;
      activeStops.delete(tracked);
      stop();
    };
    activeStops.add(tracked);
    return tracked;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    for (const stop of [...activeStops]) {
      stop();
    }
    expect(activeStops.size).toBe(0);
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
      timeline: timelineConfig,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked,
      onError,
    });
    const stopEvents = trackStop(
      container.repository.observe(
        {groupId: group.id, babyId: baby.id},
        () => undefined,
      ),
    );
    const stopTimeline = trackStop(
      container.timelineFeed.start(() => undefined),
    );
    const stopOverview = trackStop(
      container.overviewFeed.start(() => undefined),
    );
    await Promise.all([
      container.timelineFeed.refresh(),
      container.overviewFeed.refresh(),
    ]);

    remote.emitPage({kind: 'error', error: {code: 'permission_denied'}});
    await container.whenSessionSettled();

    expect(onRevoked).toHaveBeenCalledWith('membership_removed');
    expect(onError).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
    expect(remote.listeners.size).toBe(0);
    expect(remote.pageListeners.size).toBe(0);
    expect(remote.windowListeners.size).toBe(0);
    expect(remote.latestListeners.size).toBe(0);
    expect(remote.activeSleepListeners.size).toBe(0);
    expect(auth.listeners.size).toBe(0);
    expect(groups.listeners.size).toBe(0);

    stopEvents();
    stopTimeline();
    stopOverview();
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
      timeline: timelineConfig,
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

  it('starts one timeline and one overview owner for the authenticated scope', async () => {
    const remote = new FakeRemote();
    const container = await createCareEventContainer({
      auth: new FakeAuth(),
      groups: new FakeGroups(),
      context,
      remote,
      timeline: timelineConfig,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked: jest.fn(),
      onError: jest.fn(),
    });
    await Promise.all([
      container.timelineFeed.refresh(),
      container.overviewFeed.refresh(),
    ]);

    expect(remote.pageListeners.size).toBe(1);
    expect(remote.windowListeners.size).toBe(1);
    expect(remote.latestListeners.size).toBe(3);
    expect(remote.activeSleepListeners.size).toBe(1);
    const stopTimeline = trackStop(
      container.timelineFeed.start(() => undefined),
    );
    const stopOverview = trackStop(
      container.overviewFeed.start(() => undefined),
    );
    expect(remote.pageListeners.size).toBe(1);
    expect(remote.windowListeners.size).toBe(1);
    expect(remote.latestListeners.size).toBe(3);
    expect(remote.activeSleepListeners.size).toBe(1);

    await container.dispose();
    expect(remote.pageListeners.size).toBe(0);
    expect(remote.windowListeners.size).toBe(0);
    expect(remote.latestListeners.size).toBe(0);
    expect(remote.activeSleepListeners.size).toBe(0);
    stopTimeline();
    stopOverview();
  });

  it('cleans up the first owner when overview startup fails partway', async () => {
    const auth = new FakeAuth();
    const groups = new FakeGroups();
    const remote = new FakeRemote();
    const startupError = new Error('overview local observer unavailable');
    const originalObserve = PersistentCareEventSyncStore.prototype.observe;
    let observeCalls = 0;
    const observeSpy = jest
      .spyOn(PersistentCareEventSyncStore.prototype, 'observe')
      .mockImplementation(function (
        this: PersistentCareEventSyncStore,
        ...args: Parameters<typeof originalObserve>
      ) {
        observeCalls += 1;
        if (observeCalls === 2) {
          throw startupError;
        }
        return originalObserve.apply(this, args);
      });
    const dependencies = {
      auth,
      groups,
      context,
      remote,
      timeline: timelineConfig,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked: jest.fn(),
      onError: jest.fn(),
    };

    try {
      await expect(createCareEventContainer(dependencies)).rejects.toBe(
        startupError,
      );
    } finally {
      observeSpy.mockRestore();
    }

    expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
    expect(remote.pageListeners.size).toBe(0);
    expect(remote.windowListeners.size).toBe(0);
    expect(remote.latestListeners.size).toBe(0);
    expect(remote.activeSleepListeners.size).toBe(0);
    expect(auth.listeners.size).toBe(0);
    expect(groups.listeners.size).toBe(0);

    const restarted = await createCareEventContainer(dependencies);
    await restarted.dispose();
  });

  it('rebinds the page owner after verified Auth recovery', async () => {
    const remote = new FakeRemote();
    const onError = jest.fn();
    const container = await createCareEventContainer({
      auth: new FakeAuth(),
      groups: new FakeGroups(),
      context,
      remote,
      timeline: timelineConfig,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked: jest.fn(),
      onError,
    });
    await Promise.all([
      container.timelineFeed.refresh(),
      container.overviewFeed.refresh(),
    ]);
    const fetchCount = remote.fetchCount;
    const projectionFetchCount = remote.projectionFetchCount;

    remote.emitPage({kind: 'error', error: {code: 'unauthenticated'}});
    await container.whenSessionSettled();

    expect(remote.fetchCount).toBeGreaterThan(fetchCount);
    expect(remote.projectionFetchCount).toBeGreaterThan(projectionFetchCount);
    expect(remote.pageListeners.size).toBe(1);
    expect(remote.windowListeners.size).toBe(1);
    expect(remote.latestListeners.size).toBe(3);
    expect(remote.activeSleepListeners.size).toBe(1);
    expect(onError).not.toHaveBeenCalled();
    await container.dispose();
    expect(remote.listeners.size).toBe(0);
    expect(remote.pageListeners.size).toBe(0);
    expect(remote.windowListeners.size).toBe(0);
    expect(remote.latestListeners.size).toBe(0);
    expect(remote.activeSleepListeners.size).toBe(0);
  });

  it('rebinds the page owner when membership remains authorized', async () => {
    const remote = new FakeRemote();
    const onError = jest.fn();
    const onRevoked = jest.fn();
    const container = await createCareEventContainer({
      auth: new FakeAuth(),
      groups: new FakeGroups(),
      context,
      remote,
      timeline: timelineConfig,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked,
      onError,
    });
    await Promise.all([
      container.timelineFeed.refresh(),
      container.overviewFeed.refresh(),
    ]);
    const fetchCount = remote.fetchCount;
    const projectionFetchCount = remote.projectionFetchCount;

    remote.emitPage({kind: 'error', error: {code: 'permission_denied'}});
    await container.whenSessionSettled();

    expect(remote.fetchCount).toBeGreaterThan(fetchCount);
    expect(remote.projectionFetchCount).toBeGreaterThan(projectionFetchCount);
    expect(remote.pageListeners.size).toBe(1);
    expect(remote.windowListeners.size).toBe(1);
    expect(remote.latestListeners.size).toBe(3);
    expect(remote.activeSleepListeners.size).toBe(1);
    expect(onRevoked).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    await container.dispose();
    expect(remote.listeners.size).toBe(0);
    expect(remote.pageListeners.size).toBe(0);
    expect(remote.windowListeners.size).toBe(0);
    expect(remote.latestListeners.size).toBe(0);
    expect(remote.activeSleepListeners.size).toBe(0);
  });

  it('releases the scoped writer on normal teardown without purging cache', async () => {
    const remote = new FakeRemote();
    const dependencies = {
      auth: new FakeAuth(),
      groups: new FakeGroups(),
      context,
      remote,
      timeline: timelineConfig,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked: jest.fn(),
      onError: jest.fn(),
    };
    const first = await createCareEventContainer(dependencies);

    await first.dispose();

    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(remote.listeners.size).toBe(0);
    expect(remote.pageListeners.size).toBe(0);
    const replacement = await createCareEventContainer(dependencies);
    await replacement.dispose();
    expect(remote.listeners.size).toBe(0);
    expect(remote.pageListeners.size).toBe(0);
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
      timeline: timelineConfig,
      clock: {now: () => 1_000},
      idGenerator: {nextEventId: () => eventId('generated')},
      analytics: {track: async () => undefined},
      onRevoked,
      onError: jest.fn(),
    });
    const stopEvents = trackStop(
      container.repository.observe(
        {groupId: group.id, babyId: baby.id},
        () => undefined,
      ),
    );
    const stopTimeline = trackStop(
      container.timelineFeed.start(() => undefined),
    );
    await container.timelineFeed.refresh();

    remote.emitPage({kind: 'error', error: {code: 'permission_denied'}});
    await verificationStarted;
    const disposing = container.dispose();
    resolveGroups?.([]);
    await disposing;

    expect(onRevoked).toHaveBeenCalledWith('membership_removed');
    expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
    stopEvents();
    stopTimeline();
    expect(remote.listeners.size).toBe(0);
    expect(remote.pageListeners.size).toBe(0);
  });
});
