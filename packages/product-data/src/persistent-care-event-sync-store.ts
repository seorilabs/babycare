import type {
  BabyId,
  CareEvent,
  CareEventMutationKind,
  CareEventQuery,
  EventId,
  GroupId,
  StringStoragePort,
  UserId,
} from '@babycare/product-core';

import {
  careEventMutationId,
  careEventPayloadHash,
  careEventIdentityMatches,
  careEventsEqual,
  CareEventRevisionConflictError,
} from './care-event-revision.ts';
import {isPersistedCareEvent} from './care-event-codec.ts';

const STORAGE_KEY_PREFIX = '@babycare/care-event-sync/v1';
const ACTIVE_STORAGE_KEYS = new WeakMap<object, Set<string>>();

function claimStorageKey(storage: StringStoragePort, key: string): () => void {
  let keys = ACTIVE_STORAGE_KEYS.get(storage);
  if (!keys) {
    keys = new Set();
    ACTIVE_STORAGE_KEYS.set(storage, keys);
  }
  if (keys.has(key)) {
    throw new Error(`A care event sync store is already active for ${key}`);
  }
  keys.add(key);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    keys.delete(key);
    if (keys.size === 0 && ACTIVE_STORAGE_KEYS.get(storage) === keys) {
      ACTIVE_STORAGE_KEYS.delete(storage);
    }
  };
}

export interface CareEventSyncScope {
  readonly userId: UserId;
  readonly groupId: GroupId;
  readonly babyId: BabyId;
}

export type CareEventSyncFailureKind =
  | 'retryable'
  | 'conflict'
  | 'unauthenticated'
  | 'permission_denied'
  | 'invalid';
export type CareEventOutboxStatus = 'pending' | 'failed';

export class CareEventSyncHydrationError extends Error {
  constructor() {
    super(
      '저장된 공동 기록 동기화 정보가 손상되어 안전하게 복구할 수 없습니다',
    );
    this.name = 'CareEventSyncHydrationError';
  }
}

export interface CareEventOutboxEntry {
  readonly id: string;
  readonly kind: CareEventMutationKind;
  readonly event: CareEvent;
  readonly baseRevision: number;
  readonly payloadHash: string;
  readonly attempts: number;
  readonly status: CareEventOutboxStatus;
  readonly failureKind?: CareEventSyncFailureKind;
}

export interface CareEventSyncState {
  readonly eventId: EventId;
  readonly status: 'pending' | 'failed' | 'synced';
  readonly attempts: number;
  readonly pendingRevisions: readonly number[];
  readonly failureKind?: CareEventSyncFailureKind;
}

export interface CareEventSyncIssue {
  readonly id: string;
  readonly eventId: EventId;
  readonly kind: 'active_sleep_conflict';
  readonly attempts: number;
  readonly local: CareEvent;
  readonly remote: CareEvent;
}

export interface CareEventSyncLocalStorePort {
  saveAndEnqueue(event: CareEvent): Promise<void>;
  findById(groupId: GroupId, eventId: EventId): Promise<CareEvent | undefined>;
  list(query: CareEventQuery): Promise<readonly CareEvent[]>;
  observe(
    query: CareEventQuery,
    listener: (events: readonly CareEvent[]) => void,
  ): () => void;
  mergeRemoteEvents(events: readonly CareEvent[]): Promise<void>;
  nextPending(): Promise<CareEventOutboxEntry | undefined>;
  markAttemptStarted(id: string): Promise<CareEventOutboxEntry | undefined>;
  markFailed(id: string, kind: CareEventSyncFailureKind): Promise<void>;
  markSynced(id: string): Promise<void>;
  resolveActiveSleepConflict(id: string, remote: CareEvent): Promise<void>;
  requeueFailed(
    failureKinds?: readonly CareEventSyncFailureKind[],
  ): Promise<void>;
  getSyncState(eventId: EventId): Promise<CareEventSyncState>;
  observeSyncState(
    listener: (states: readonly CareEventSyncState[]) => void,
  ): () => void;
  clear(): Promise<void>;
  close(): Promise<void>;
}

interface PersistedCareEventSyncState {
  readonly version: 1;
  readonly scope: CareEventSyncScope;
  readonly events: readonly CareEvent[];
  readonly outbox: readonly CareEventOutboxEntry[];
  readonly issues: readonly CareEventSyncIssue[];
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function decodeOutboxEntry(value: unknown): CareEventOutboxEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const entry = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(entry, [
      'id',
      'kind',
      'event',
      'baseRevision',
      'payloadHash',
      'attempts',
      'status',
      'failureKind',
    ]) ||
    !isPersistedCareEvent(entry.event) ||
    entry.id !== careEventMutationId(entry.event) ||
    !['create', 'update', 'end_sleep', 'soft_delete'].includes(
      entry.kind as string,
    ) ||
    !Number.isSafeInteger(entry.baseRevision) ||
    entry.baseRevision !== entry.event.revision - 1 ||
    entry.payloadHash !== careEventPayloadHash(entry.event) ||
    !Number.isSafeInteger(entry.attempts) ||
    (entry.attempts as number) < 0 ||
    !['pending', 'failed'].includes(entry.status as string)
  ) {
    return undefined;
  }
  if (entry.status === 'pending' && entry.failureKind !== undefined) {
    return undefined;
  }
  if (
    entry.status === 'failed' &&
    ![
      'retryable',
      'conflict',
      'unauthenticated',
      'permission_denied',
      'invalid',
    ].includes(entry.failureKind as string)
  ) {
    return undefined;
  }
  return {
    id: entry.id as string,
    kind: entry.kind as CareEventMutationKind,
    event: entry.event,
    baseRevision: entry.baseRevision as number,
    payloadHash: entry.payloadHash as string,
    attempts: entry.attempts as number,
    status: entry.status as CareEventOutboxStatus,
    ...(entry.failureKind !== undefined
      ? {failureKind: entry.failureKind as CareEventSyncFailureKind}
      : {}),
  };
}

function decodeSyncIssue(value: unknown): CareEventSyncIssue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const issue = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(issue, [
      'id',
      'eventId',
      'kind',
      'attempts',
      'local',
      'remote',
    ]) ||
    issue.kind !== 'active_sleep_conflict' ||
    !isPersistedCareEvent(issue.local) ||
    !isPersistedCareEvent(issue.remote) ||
    issue.local.kind !== 'sleep' ||
    issue.local.endedAt !== undefined ||
    issue.local.deletedAt !== undefined ||
    issue.remote.kind !== 'sleep' ||
    issue.remote.endedAt !== undefined ||
    issue.remote.deletedAt !== undefined ||
    issue.local.groupId !== issue.remote.groupId ||
    issue.local.babyId !== issue.remote.babyId ||
    issue.eventId !== issue.local.id ||
    issue.id !== `${careEventMutationId(issue.local)}:active_sleep_conflict` ||
    !Number.isSafeInteger(issue.attempts) ||
    (issue.attempts as number) < 1
  ) {
    return undefined;
  }
  return {
    id: issue.id as string,
    eventId: issue.local.id,
    kind: 'active_sleep_conflict',
    attempts: issue.attempts as number,
    local: issue.local,
    remote: issue.remote,
  };
}

function decodeState(
  value: unknown,
  expectedScope: CareEventSyncScope,
): PersistedCareEventSyncState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const state = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(state, ['version', 'scope', 'events', 'outbox', 'issues']) ||
    state.version !== 1 ||
    !state.scope ||
    typeof state.scope !== 'object' ||
    Array.isArray(state.scope) ||
    !Array.isArray(state.events) ||
    !Array.isArray(state.outbox) ||
    !Array.isArray(state.issues)
  ) {
    return undefined;
  }
  const scope = state.scope as Record<string, unknown>;
  if (
    !hasOnlyKeys(scope, ['userId', 'groupId', 'babyId']) ||
    scope.userId !== expectedScope.userId ||
    scope.groupId !== expectedScope.groupId ||
    scope.babyId !== expectedScope.babyId
  ) {
    return undefined;
  }

  const events = new Map<EventId, CareEvent>();
  for (const valueEvent of state.events) {
    if (
      !isPersistedCareEvent(valueEvent) ||
      valueEvent.groupId !== expectedScope.groupId ||
      valueEvent.babyId !== expectedScope.babyId ||
      events.has(valueEvent.id)
    ) {
      return undefined;
    }
    events.set(valueEvent.id, valueEvent);
  }

  const outbox = new Map<string, CareEventOutboxEntry>();
  for (const valueEntry of state.outbox) {
    const entry = decodeOutboxEntry(valueEntry);
    const latest = entry ? events.get(entry.event.id) : undefined;
    if (
      !entry ||
      outbox.has(entry.id) ||
      !latest ||
      !careEventIdentityMatches(latest, entry.event) ||
      entry.event.revision > latest.revision
    ) {
      return undefined;
    }
    outbox.set(entry.id, entry);
  }

  const issues = new Map<string, CareEventSyncIssue>();
  for (const valueIssue of state.issues) {
    const issue = decodeSyncIssue(valueIssue);
    if (
      !issue ||
      issues.has(issue.id) ||
      issue.local.groupId !== expectedScope.groupId ||
      issue.local.babyId !== expectedScope.babyId ||
      issue.remote.groupId !== expectedScope.groupId ||
      issue.remote.babyId !== expectedScope.babyId
    ) {
      return undefined;
    }
    issues.set(issue.id, issue);
  }

  return {
    version: 1,
    scope: expectedScope,
    events: [...events.values()],
    outbox: [...outbox.values()],
    issues: [...issues.values()],
  };
}

async function discardStorage(
  storage: StringStoragePort,
  key: string,
): Promise<void> {
  try {
    await storage.removeItem(key);
  } catch {
    // A failed purge must not replace the original validation or write error.
  }
}

function sortOutbox(
  left: CareEventOutboxEntry,
  right: CareEventOutboxEntry,
): number {
  return (
    left.event.createdAt - right.event.createdAt ||
    left.event.id.localeCompare(right.event.id) ||
    left.event.revision - right.event.revision
  );
}

export class PersistentCareEventSyncStore
  implements CareEventSyncLocalStorePort
{
  readonly #scope: CareEventSyncScope;
  readonly #storage: StringStoragePort;
  readonly #storageKey: string;
  readonly #events = new Map<EventId, CareEvent>();
  readonly #outbox = new Map<string, CareEventOutboxEntry>();
  readonly #issues = new Map<string, CareEventSyncIssue>();
  readonly #subscriptions = new Set<{
    readonly query: CareEventQuery;
    readonly listener: (events: readonly CareEvent[]) => void;
  }>();
  readonly #syncSubscriptions = new Set<
    (states: readonly CareEventSyncState[]) => void
  >();
  readonly #ready: Promise<void>;
  #releaseStorageKey: () => void;
  #writeQueue: Promise<void> = Promise.resolve();
  #closed = false;
  #hydrationFailed = false;
  #purgeFailed = false;
  #purgeRequested = false;
  #claimHeld = true;
  #shutdown: Promise<void> | undefined;
  #shutdownMode: 'close' | 'purge' | undefined;

  constructor(scope: CareEventSyncScope, storage: StringStoragePort) {
    this.#scope = scope;
    this.#storage = storage;
    this.#storageKey = [
      STORAGE_KEY_PREFIX,
      encodeURIComponent(scope.userId),
      encodeURIComponent(scope.groupId),
      encodeURIComponent(scope.babyId),
    ].join('/');
    this.#releaseStorageKey = claimStorageKey(storage, this.#storageKey);
    this.#ready = this.#hydrate().catch(error => {
      this.#hydrationFailed = true;
      this.#closed = true;
      throw error;
    });
    // Hydration remains rejectable for every public operation, but the store
    // may be constructed before UI subscribes. Mark the eager promise handled
    // immediately so a storage read failure cannot become a process-level
    // unhandled rejection in that gap.
    this.#ready.catch(() => undefined);
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error('Care event sync store is closed');
    }
  }

  async #hydrate(): Promise<void> {
    const raw = await this.#storage.getItem(this.#storageKey);
    if (raw) {
      try {
        const state = decodeState(JSON.parse(raw), this.#scope);
        if (state) {
          for (const event of state.events) {
            this.#events.set(event.id, event);
          }
          for (const entry of state.outbox) {
            this.#outbox.set(entry.id, entry);
          }
          for (const issue of state.issues) {
            this.#issues.set(issue.id, issue);
          }
          return;
        }
      } catch {
        // Invalid scoped state is discarded and surfaced below.
      }
      await discardStorage(this.#storage, this.#storageKey);
      throw new CareEventSyncHydrationError();
    }
  }

  #persistedState(): PersistedCareEventSyncState {
    return {
      version: 1,
      scope: this.#scope,
      events: [...this.#events.values()],
      outbox: [...this.#outbox.values()].sort(sortOutbox),
      issues: [...this.#issues.values()],
    };
  }

  async #persist(): Promise<void> {
    await this.#storage.setItem(
      this.#storageKey,
      JSON.stringify(this.#persistedState()),
    );
  }

  #listFromMemory(query: CareEventQuery): readonly CareEvent[] {
    const events = [...this.#events.values()]
      .filter(
        event =>
          event.groupId === query.groupId && event.babyId === query.babyId,
      )
      .filter(event => query.includeDeleted || event.deletedAt === undefined)
      .filter(event => query.from === undefined || event.occurredAt >= query.from)
      .filter(event => query.to === undefined || event.occurredAt < query.to)
      .filter(event => !query.kinds || query.kinds.includes(event.kind))
      .sort((left, right) => right.occurredAt - left.occurredAt);
    return query.limit === undefined ? events : events.slice(0, query.limit);
  }

  #syncStateFromMemory(eventId: EventId): CareEventSyncState {
    const issue = [...this.#issues.values()].find(
      candidate => candidate.eventId === eventId,
    );
    if (issue) {
      return {
        eventId,
        status: 'failed',
        attempts: issue.attempts,
        pendingRevisions: [issue.local.revision],
        failureKind: 'conflict',
      };
    }
    const entries = [...this.#outbox.values()]
      .filter(entry => entry.event.id === eventId)
      .sort((left, right) => left.event.revision - right.event.revision);
    if (entries.length === 0) {
      return {
        eventId,
        status: 'synced',
        attempts: 0,
        pendingRevisions: [],
      };
    }
    const failed = entries.find(entry => entry.status === 'failed');
    const conflict = entries.find(entry => entry.failureKind === 'conflict');
    return {
      eventId,
      status: failed ? 'failed' : 'pending',
      attempts: Math.max(...entries.map(entry => entry.attempts)),
      pendingRevisions: entries.map(entry => entry.event.revision),
      ...(conflict?.failureKind
        ? {failureKind: conflict.failureKind}
        : failed?.failureKind
          ? {failureKind: failed.failureKind}
          : {}),
    };
  }

  #allSyncStates(): readonly CareEventSyncState[] {
    const eventIds = new Set([
      ...this.#events.keys(),
      ...[...this.#issues.values()].map(issue => issue.eventId),
    ]);
    return [...eventIds].map(eventId =>
      this.#syncStateFromMemory(eventId),
    );
  }

  #emit(): void {
    for (const subscription of this.#subscriptions) {
      try {
        subscription.listener(this.#listFromMemory(subscription.query));
      } catch {
        // A listener cannot roll back an already durable local write.
      }
    }
    const states = this.#allSyncStates();
    for (const listener of this.#syncSubscriptions) {
      try {
        listener(states);
      } catch {
        // Sync observers are delivery concerns, not persistence failures.
      }
    }
  }

  async #commit(mutation: () => void): Promise<void> {
    this.#assertOpen();
    await this.#ready;
    this.#assertOpen();
    const operation = this.#writeQueue.then(async () => {
      const previousEvents = new Map(this.#events);
      const previousOutbox = new Map(this.#outbox);
      const previousIssues = new Map(this.#issues);
      try {
        mutation();
        await this.#persist();
      } catch (error) {
        this.#events.clear();
        this.#outbox.clear();
        this.#issues.clear();
        for (const [id, event] of previousEvents) {
          this.#events.set(id, event);
        }
        for (const [id, entry] of previousOutbox) {
          this.#outbox.set(id, entry);
        }
        for (const [id, issue] of previousIssues) {
          this.#issues.set(id, issue);
        }
        throw error;
      }
      this.#emit();
    });
    this.#writeQueue = operation.catch(() => undefined);
    await operation;
  }

  async #read<T>(reader: () => T): Promise<T> {
    this.#assertOpen();
    await this.#ready;
    this.#assertOpen();
    let result: T | undefined;
    const operation = this.#writeQueue.then(() => {
      result = reader();
    });
    this.#writeQueue = operation.catch(() => undefined);
    await operation;
    return result as T;
  }

  #applyLocalEvent(event: CareEvent): boolean {
    if (!isPersistedCareEvent(event)) {
      throw new Error('Care event is not canonical and cannot be persisted');
    }
    if (
      event.groupId !== this.#scope.groupId ||
      event.babyId !== this.#scope.babyId
    ) {
      throw new Error('Care event is outside the authenticated sync scope');
    }
    const current = this.#events.get(event.id);
    if (!current) {
      if (event.revision !== 1) {
        throw new CareEventRevisionConflictError(
          'A new local care event must start at revision 1',
        );
      }
      this.#events.set(event.id, event);
      return true;
    }
    if (!careEventIdentityMatches(current, event)) {
      throw new CareEventRevisionConflictError(
        'Care event identity cannot change locally',
      );
    }
    if (event.revision === current.revision) {
      if (careEventsEqual(current, event)) {
        return false;
      }
      throw new CareEventRevisionConflictError(
        'Care event content differs at the current local revision',
      );
    }
    if (event.revision !== current.revision + 1) {
      throw new CareEventRevisionConflictError(
        'Local care event revisions must be contiguous',
      );
    }
    this.#events.set(event.id, event);
    return true;
  }

  async saveAndEnqueue(event: CareEvent): Promise<void> {
    await this.#commit(() => {
      const current = this.#events.get(event.id);
      if (!this.#applyLocalEvent(event)) {
        return;
      }
      const id = careEventMutationId(event);
      const payloadHash = careEventPayloadHash(event);
      const kind: CareEventMutationKind = !current
        ? 'create'
        : event.deletedAt !== undefined && current.deletedAt === undefined
          ? 'soft_delete'
          : event.kind === 'sleep' &&
              current.kind === 'sleep' &&
              event.endedAt !== undefined &&
              current.endedAt === undefined
            ? 'end_sleep'
            : 'update';
      this.#outbox.set(id, {
        id,
        kind,
        event,
        baseRevision: event.revision - 1,
        payloadHash,
        attempts: 0,
        status: 'pending',
      });
    });
  }

  async findById(
    group: GroupId,
    id: EventId,
  ): Promise<CareEvent | undefined> {
    return this.#read(() => {
      const event = this.#events.get(id);
      return event?.groupId === group ? event : undefined;
    });
  }

  async list(query: CareEventQuery): Promise<readonly CareEvent[]> {
    return this.#read(() => this.#listFromMemory(query));
  }

  observe(
    query: CareEventQuery,
    listener: (events: readonly CareEvent[]) => void,
  ): () => void {
    this.#assertOpen();
    const subscription = {query, listener};
    let active = true;
    this.#subscriptions.add(subscription);
    this.list(query)
      .then(events => {
        if (active && this.#subscriptions.has(subscription)) {
          listener(events);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      this.#subscriptions.delete(subscription);
    };
  }

  #markEventConflict(eventId: EventId): void {
    for (const [id, entry] of this.#outbox) {
      if (entry.event.id === eventId) {
        this.#outbox.set(id, {
          ...entry,
          status: 'failed',
          failureKind: 'conflict',
        });
      }
    }
  }

  #removeAcknowledged(event: CareEvent): void {
    for (const [id, entry] of this.#outbox) {
      if (
        entry.event.id === event.id &&
        entry.event.revision <= event.revision
      ) {
        this.#outbox.delete(id);
      }
    }
  }

  async mergeRemoteEvents(events: readonly CareEvent[]): Promise<void> {
    await this.#commit(() => {
      for (const remote of events) {
        if (!isPersistedCareEvent(remote)) {
          throw new Error('Remote care event is not canonical');
        }
        if (
          remote.groupId !== this.#scope.groupId ||
          remote.babyId !== this.#scope.babyId
        ) {
          throw new Error('Remote care event is outside the sync scope');
        }
        const local = this.#events.get(remote.id);
        if (!local) {
          this.#events.set(remote.id, remote);
          continue;
        }
        if (!careEventIdentityMatches(local, remote)) {
          this.#markEventConflict(remote.id);
          continue;
        }
        if (remote.revision > local.revision) {
          this.#events.set(remote.id, remote);
          if (
            [...this.#outbox.values()].some(
              entry => entry.event.id === remote.id,
            )
          ) {
            this.#markEventConflict(remote.id);
          } else {
            this.#removeAcknowledged(remote);
          }
          continue;
        }
        if (remote.revision === local.revision) {
          if (careEventsEqual(local, remote)) {
            this.#removeAcknowledged(remote);
          } else if (
            [...this.#outbox.values()].some(
              entry =>
                entry.event.id === remote.id &&
                entry.event.revision === remote.revision,
            )
          ) {
            this.#markEventConflict(remote.id);
            this.#events.set(remote.id, remote);
          } else {
            this.#events.set(remote.id, remote);
          }
          continue;
        }

        const matchingMutation = this.#outbox.get(careEventMutationId(remote));
        if (
          matchingMutation &&
          careEventsEqual(matchingMutation.event, remote)
        ) {
          this.#outbox.delete(matchingMutation.id);
        }
      }
    });
  }

  async nextPending(): Promise<CareEventOutboxEntry | undefined> {
    return this.#read(
      () =>
        [...this.#outbox.values()]
          .filter(entry => entry.status === 'pending')
          .filter(
            entry =>
              ![...this.#outbox.values()].some(
                candidate =>
                  candidate.event.id === entry.event.id &&
                  candidate.event.revision < entry.event.revision,
              ),
          )
          .sort(sortOutbox)[0],
    );
  }

  async markAttemptStarted(
    id: string,
  ): Promise<CareEventOutboxEntry | undefined> {
    let result: CareEventOutboxEntry | undefined;
    await this.#commit(() => {
      const entry = this.#outbox.get(id);
      if (!entry || entry.status !== 'pending') {
        return;
      }
      result = {...entry, attempts: entry.attempts + 1};
      this.#outbox.set(id, result);
    });
    return result;
  }

  async markFailed(id: string, kind: CareEventSyncFailureKind): Promise<void> {
    await this.#commit(() => {
      const entry = this.#outbox.get(id);
      if (!entry) {
        return;
      }
      this.#outbox.set(id, {
        ...entry,
        status: 'failed',
        failureKind: kind,
      });
    });
  }

  async markSynced(id: string): Promise<void> {
    await this.#commit(() => {
      this.#outbox.delete(id);
    });
  }

  async resolveActiveSleepConflict(
    id: string,
    remote: CareEvent,
  ): Promise<void> {
    await this.#commit(() => {
      const entry = this.#outbox.get(id);
      if (!entry) {
        return;
      }
      if (
        remote.kind !== 'sleep' ||
        remote.endedAt !== undefined ||
        remote.deletedAt !== undefined ||
        remote.groupId !== entry.event.groupId ||
        remote.babyId !== entry.event.babyId
      ) {
        throw new Error('Active sleep conflict payload is invalid');
      }
      for (const [mutationKey, candidate] of this.#outbox) {
        if (candidate.event.id === entry.event.id) {
          this.#outbox.delete(mutationKey);
        }
      }
      this.#events.delete(entry.event.id);
      this.#events.set(remote.id, remote);
      const issue: CareEventSyncIssue = {
        id: `${careEventMutationId(entry.event)}:active_sleep_conflict`,
        eventId: entry.event.id,
        kind: 'active_sleep_conflict',
        attempts: entry.attempts,
        local: entry.event,
        remote,
      };
      this.#issues.set(issue.id, issue);
    });
  }

  async requeueFailed(
    failureKinds: readonly CareEventSyncFailureKind[] = ['retryable'],
  ): Promise<void> {
    await this.#commit(() => {
      for (const [id, entry] of this.#outbox) {
        if (
          entry.status === 'failed' &&
          entry.failureKind !== undefined &&
          failureKinds.includes(entry.failureKind)
        ) {
          this.#outbox.set(id, {
            id: entry.id,
            kind: entry.kind,
            event: entry.event,
            baseRevision: entry.baseRevision,
            payloadHash: entry.payloadHash,
            attempts: entry.attempts,
            status: 'pending',
          });
        }
      }
    });
  }

  async getSyncState(eventId: EventId): Promise<CareEventSyncState> {
    return this.#read(() => this.#syncStateFromMemory(eventId));
  }

  observeSyncState(
    listener: (states: readonly CareEventSyncState[]) => void,
  ): () => void {
    this.#assertOpen();
    let active = true;
    this.#syncSubscriptions.add(listener);
    this.#read(() => this.#allSyncStates())
      .then(states => {
        if (active && this.#syncSubscriptions.has(listener)) {
          listener(states);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      this.#syncSubscriptions.delete(listener);
    };
  }

  async clear(): Promise<void> {
    if (this.#shutdown) {
      const shutdown = this.#shutdown;
      if (this.#shutdownMode === 'close' && this.#claimHeld) {
        // Upgrade an in-flight cache-preserving close before it releases the
        // single-writer claim. A privacy purge must never silently degrade to
        // close merely because both lifecycle paths raced.
        this.#purgeRequested = true;
        this.#shutdownMode = 'purge';
        await shutdown;
        return;
      }
      await shutdown;
      if (this.#shutdown !== shutdown) {
        // Another clear may have replaced a completed close with the real
        // purge while this caller was awaiting the old promise. Join the
        // current operation so no caller can report success before removal.
        return this.clear();
      }
      if (this.#shutdownMode === 'purge') {
        return;
      }

      // A completed normal close released its claim. Reacquire it before
      // removing storage so a replacement writer cannot be deleted.
      this.#shutdown = undefined;
      this.#shutdownMode = undefined;
      this.#purgeRequested = true;
      try {
        this.#reclaimStorageKey();
      } catch (error) {
        this.#purgeFailed = true;
        throw error;
      }
      await this.#runPurge();
      return;
    }
    if (this.#closed) {
      if (
        this.#hydrationFailed ||
        this.#purgeFailed ||
        this.#purgeRequested
      ) {
        this.#reclaimStorageKey();
        await this.#runPurge();
      }
      return;
    }

    // Close synchronously so no new write can enter while the purge is queued.
    // The storage removal itself runs inside the same queue as prior commits.
    this.#closed = true;
    await this.#runPurge();
  }

  async close(): Promise<void> {
    if (this.#shutdown) {
      await this.#shutdown;
      return;
    }
    if (this.#closed) {
      if (this.#hydrationFailed || this.#purgeFailed) {
        this.#reclaimStorageKey();
        await this.#runPurge();
      }
      return;
    }
    this.#closed = true;
    const operation = (async () => {
      await this.#ready.catch(() => undefined);
      await this.#writeQueue;
      if (
        this.#purgeRequested ||
        this.#hydrationFailed ||
        this.#purgeFailed
      ) {
        this.#shutdownMode = 'purge';
        await this.#purgeAndClose();
        this.#purgeFailed = false;
      } else {
        this.#finishClose();
      }
    })();
    this.#shutdownMode = 'close';
    this.#shutdown = operation;
    try {
      await operation;
    } catch (error) {
      // The normal close branch cannot fail after its awaited queues settle;
      // any rejection here came from the upgraded privacy purge.
      this.#purgeFailed = true;
      if (this.#shutdown === operation) {
        this.#shutdown = undefined;
        this.#shutdownMode = undefined;
      }
      throw error;
    }
  }

  async #runPurge(): Promise<void> {
    if (!this.#claimHeld) {
      throw new Error(
        'Care event sync store cannot purge without the scoped writer claim',
      );
    }
    const operation = this.#purgeAndClose();
    this.#shutdownMode = 'purge';
    this.#shutdown = operation;
    try {
      await operation;
      this.#purgeFailed = false;
    } catch (error) {
      this.#purgeFailed = true;
      if (this.#shutdown === operation) {
        this.#shutdown = undefined;
        this.#shutdownMode = undefined;
      }
      throw error;
    }
  }

  async #purgeAndClose(): Promise<void> {
    let completed = false;
    try {
      try {
        await this.#ready;
      } catch {
        // Hydration already failed closed. Make one explicit removal attempt
        // so a storage read/validation failure cannot retain the old envelope.
        await this.#storage.removeItem(this.#storageKey);
        completed = true;
        return;
      }

      const operation = this.#writeQueue.then(async () => {
        this.#events.clear();
        this.#outbox.clear();
        this.#issues.clear();

        let persistError: unknown;
        let removeError: unknown;
        try {
          // Persisting an empty envelope first removes care records before a
          // later key-removal failure, which is still surfaced to the caller.
          await this.#persist();
        } catch (error) {
          persistError = error;
        }
        try {
          await this.#storage.removeItem(this.#storageKey);
        } catch (error) {
          removeError = error;
        }

        this.#emit();
        if (removeError !== undefined && persistError !== undefined) {
          throw new AggregateError(
            [persistError, removeError],
            'Care event cache purge failed',
          );
        }
        if (removeError !== undefined) {
          throw new AggregateError(
            [removeError],
            'Care event cache key removal failed after data was cleared',
          );
        }
      });
      this.#writeQueue = operation.catch(() => undefined);
      await operation;
      completed = true;
    } finally {
      this.#subscriptions.clear();
      this.#syncSubscriptions.clear();
      if (completed) {
        this.#releaseClaim();
      }
    }
  }

  #finishClose(): void {
    this.#subscriptions.clear();
    this.#syncSubscriptions.clear();
    this.#releaseClaim();
  }

  #releaseClaim(): void {
    if (!this.#claimHeld) {
      return;
    }
    this.#claimHeld = false;
    this.#releaseStorageKey();
  }

  #reclaimStorageKey(): void {
    if (this.#claimHeld) {
      return;
    }
    this.#releaseStorageKey = claimStorageKey(
      this.#storage,
      this.#storageKey,
    );
    this.#claimHeld = true;
  }
}
