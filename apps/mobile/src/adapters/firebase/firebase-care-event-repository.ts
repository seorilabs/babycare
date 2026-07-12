import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitQuery,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from '@react-native-firebase/firestore';
import type {
  CareEvent,
  CareEventMutation,
  CareEventQuery,
  CareEventRemoteError,
  CareEventRemoteStorePort,
  CareEventPushResult,
  EventId,
  GroupId,
  SleepEvent,
  UserId,
} from '@babycare/product-core';
import {
  careEventMutationId,
  careEventPayloadHash,
  careEventsEqual,
  CareEventRevisionConflictError,
  planCareEventRemoteWrite,
} from '@babycare/product-data';

import {
  decodeCareEventDocument,
  encodeCareEventDocument,
  selectCareEventQueryResults,
} from './care-event-document';

export class CareEventRemoteStoreError extends Error {
  readonly remoteError: CareEventRemoteError;

  constructor(remoteError: CareEventRemoteError) {
    super(`Care event remote transport failed: ${remoteError.code}`);
    this.name = 'CareEventRemoteStoreError';
    this.remoteError = remoteError;
  }
}

export function normalizeCareEventRemoteError(
  error: unknown,
): CareEventRemoteError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  if (code.endsWith('unauthenticated')) {
    return {code: 'unauthenticated', cause: error};
  }
  if (code.endsWith('permission-denied')) {
    return {code: 'permission_denied', cause: error};
  }
  if (
    ['aborted', 'cancelled', 'deadline-exceeded', 'internal', 'network-request-failed', 'resource-exhausted', 'unavailable', 'unknown'].some(
      value => code.endsWith(value),
    )
  ) {
    return {code: 'retryable', cause: error};
  }
  return {code: 'invalid', cause: error};
}

interface ActiveSleepLock {
  readonly groupId: GroupId;
  readonly babyId: string;
  readonly eventId: EventId;
  readonly caregiverId: string;
  readonly startedAt: number;
  readonly createdAt: number;
}

function decodeActiveSleepLock(
  value: unknown,
  expected: {readonly groupId: GroupId; readonly babyId: string},
): ActiveSleepLock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Active sleep lock must be an object');
  }
  const data = value as Record<string, unknown>;
  const fields = [
    'groupId',
    'babyId',
    'eventId',
    'caregiverId',
    'startedAt',
    'createdAt',
  ];
  if (Object.keys(data).some(key => !fields.includes(key))) {
    throw new Error('Active sleep lock has an unexpected field');
  }
  if (
    data.groupId !== expected.groupId ||
    data.babyId !== expected.babyId ||
    typeof data.eventId !== 'string' ||
    data.eventId.length === 0 ||
    typeof data.caregiverId !== 'string' ||
    data.caregiverId.length === 0 ||
    !Number.isSafeInteger(data.startedAt) ||
    !Number.isSafeInteger(data.createdAt)
  ) {
    throw new Error('Active sleep lock is invalid');
  }
  return data as unknown as ActiveSleepLock;
}

function isActiveSleepEvent(event: CareEvent): event is SleepEvent {
  return (
    event.kind === 'sleep' &&
    event.endedAt === undefined &&
    event.deletedAt === undefined
  );
}

function receiptMatchesMutation(
  value: unknown,
  mutation: CareEventMutation,
  expectedActorUid: UserId,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const data = value as Record<string, unknown>;
  const expectedKeys = [
    'id',
    'groupId',
    'babyId',
    'eventId',
    'revision',
    'payloadHash',
    'kind',
    'actorUid',
    'appliedAt',
    'payload',
  ];
  return (
    Object.keys(data).every(key => expectedKeys.includes(key)) &&
    data.id === mutation.id &&
    data.groupId === mutation.event.groupId &&
    data.babyId === mutation.event.babyId &&
    data.eventId === mutation.event.id &&
    data.revision === mutation.event.revision &&
    data.payloadHash === mutation.payloadHash &&
    data.kind === mutation.kind &&
    data.actorUid === expectedActorUid &&
    data.appliedAt !== undefined &&
    receiptPayloadMatchesMutation(data.payload, mutation)
  );
}

function receiptPayloadMatchesMutation(
  value: unknown,
  mutation: CareEventMutation,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  const expected = encodeCareEventDocument(mutation.event, mutation);
  const keys = Object.keys(payload);
  return (
    keys.length === Object.keys(expected).length &&
    keys.every(
      key =>
        Object.prototype.hasOwnProperty.call(expected, key) &&
        payload[key] === expected[key],
    )
  );
}

/**
 * Remote Firestore transport. This is intentionally not a UI repository:
 * Firestore write promises resolve on server acknowledgement, so production
 * composition must place a durable local repository/outbox in front of it.
 */
export class FirebaseCareEventRemoteStore implements CareEventRemoteStorePort {
  readonly #firestore: Firestore;
  readonly #actorUserId: UserId;
  readonly #onDecodeError: (error: Error) => void;

  constructor(
    firestore: Firestore,
    actorUserId: UserId,
    onDecodeError: (error: Error) => void,
  ) {
    this.#firestore = firestore;
    this.#actorUserId = actorUserId;
    this.#onDecodeError = onDecodeError;
  }

  #collection(group: GroupId) {
    return collection(this.#firestore, 'groups', group, 'events');
  }

  #receiptCollection(group: GroupId) {
    return collection(
      this.#firestore,
      'groups',
      group,
      'eventMutationReceipts',
    );
  }

  #activeSleepCollection(group: GroupId) {
    return collection(this.#firestore, 'groups', group, 'activeSleeps');
  }

  #query(criteria: CareEventQuery): Query<DocumentData, DocumentData> {
    let result: Query<DocumentData, DocumentData> = this.#collection(criteria.groupId);
    result = query(result, where('babyId', '==', criteria.babyId));
    if (!criteria.includeDeleted) {
      result = query(result, where('isDeleted', '==', false));
    }
    if (criteria.from !== undefined) {
      result = query(result, where('occurredAt', '>=', criteria.from));
    }
    if (criteria.to !== undefined) {
      result = query(result, where('occurredAt', '<', criteria.to));
    }
    if (criteria.kinds?.length === 1) {
      result = query(result, where('kind', '==', criteria.kinds[0]));
    } else if (criteria.kinds && criteria.kinds.length > 1) {
      result = query(result, where('kind', 'in', [...criteria.kinds]));
    }
    result = query(result, orderBy('occurredAt', 'desc'));
    if (criteria.limit !== undefined) {
      result = query(result, limitQuery(criteria.limit));
    }
    return result;
  }

  #decode(
    snapshot: QueryDocumentSnapshot<DocumentData, DocumentData>,
    group: GroupId,
  ): CareEvent {
    return decodeCareEventDocument({
      documentId: snapshot.id,
      groupId: group,
      data: snapshot.data(),
    });
  }

  #report(error: unknown): Error {
    const normalized =
      error instanceof Error ? error : new Error('Invalid care event document');
    this.#onDecodeError(normalized);
    return normalized;
  }

  async push(mutation: CareEventMutation): Promise<CareEventPushResult> {
    const event = mutation.event;
    if (
      mutation.payloadHash !== careEventPayloadHash(event) ||
      mutation.id !== careEventMutationId(event) ||
      mutation.baseRevision !== event.revision - 1
    ) {
      throw new CareEventRemoteStoreError({code: 'invalid'});
    }
    const reference = doc(this.#collection(event.groupId), event.id);
    const receiptReference = doc(
      this.#receiptCollection(event.groupId),
      mutation.id,
    );
    const activeSleepReference = doc(
      this.#activeSleepCollection(event.groupId),
      event.babyId,
    );
    try {
      return await runTransaction(this.#firestore, async transaction => {
        const receiptSnapshot = await transaction.get(receiptReference);
        const snapshot = await transaction.get(reference);
        const lockSnapshot =
          event.kind === 'sleep'
            ? await transaction.get(activeSleepReference)
            : undefined;
        const remote = snapshot.exists()
          ? decodeCareEventDocument({
              documentId: snapshot.id,
              groupId: event.groupId,
              data: snapshot.data(),
            })
          : undefined;
        if (receiptSnapshot.exists()) {
          if (
            !receiptMatchesMutation(
              receiptSnapshot.data(),
              mutation,
              this.#actorUserId,
            ) ||
            !remote ||
            remote.revision < event.revision
          ) {
            throw new Error('Care event mutation receipt is invalid');
          }
          if (
            remote.revision === event.revision &&
            !careEventsEqual(remote, event)
          ) {
            return {kind: 'revision_conflict', remote};
          }
          return {kind: 'already_applied', remote};
        }

        let lock: ActiveSleepLock | undefined;
        if (lockSnapshot?.exists()) {
          lock = decodeActiveSleepLock(lockSnapshot.data(), {
            groupId: event.groupId,
            babyId: event.babyId,
          });
        }
        if (
          mutation.kind === 'create' &&
          isActiveSleepEvent(event) &&
          lock &&
          lock.eventId !== event.id
        ) {
          const activeSnapshot = await transaction.get(
            doc(this.#collection(event.groupId), lock.eventId),
          );
          if (!activeSnapshot.exists()) {
            throw new Error('Active sleep lock points to a missing event');
          }
          const remoteActiveSleep = decodeCareEventDocument({
            documentId: activeSnapshot.id,
            groupId: event.groupId,
            data: activeSnapshot.data(),
          });
          if (!isActiveSleepEvent(remoteActiveSleep)) {
            throw new Error('Active sleep lock points to an inactive event');
          }
          return {kind: 'active_sleep_conflict', remoteActiveSleep};
        }
        let plan: ReturnType<typeof planCareEventRemoteWrite>;
        try {
          plan = planCareEventRemoteWrite(remote, event);
        } catch (error) {
          if (error instanceof CareEventRevisionConflictError && remote) {
            return {kind: 'revision_conflict', remote};
          }
          throw error;
        }
        if (plan === 'noop') {
          // A receipt can only be created with the corresponding event
          // revision transition. Equal data without that receipt is not proof
          // that this exact mutation was previously acknowledged.
          return {kind: 'revision_conflict', remote: remote as CareEvent};
        }
        const encodedEvent = encodeCareEventDocument(event, mutation);
        transaction.set(reference, encodedEvent);
        if (mutation.kind === 'create' && isActiveSleepEvent(event)) {
          transaction.set(activeSleepReference, {
            groupId: event.groupId,
            babyId: event.babyId,
            eventId: event.id,
            caregiverId: event.caregiverId,
            startedAt: event.startedAt,
            createdAt: event.createdAt,
          });
        } else if (
          lock?.eventId === event.id &&
          !isActiveSleepEvent(event)
        ) {
          transaction.delete(activeSleepReference);
        }
        transaction.set(receiptReference, {
          id: mutation.id,
          groupId: event.groupId,
          babyId: event.babyId,
          eventId: event.id,
          revision: event.revision,
          payloadHash: mutation.payloadHash,
          kind: mutation.kind,
          actorUid: this.#actorUserId,
          appliedAt: serverTimestamp(),
          payload: encodedEvent,
        });
        return {kind: 'applied', remote: event};
      });
    } catch (error) {
      throw new CareEventRemoteStoreError(normalizeCareEventRemoteError(error));
    }
  }

  async findById(group: GroupId, id: EventId): Promise<CareEvent | undefined> {
    const snapshot = await getDoc(doc(this.#collection(group), id));
    if (!snapshot.exists()) {
      return undefined;
    }
    return decodeCareEventDocument({
      documentId: snapshot.id,
      groupId: group,
      data: snapshot.data(),
    });
  }

  async list(criteria: CareEventQuery): Promise<readonly CareEvent[]> {
    if (criteria.kinds?.length === 0) {
      return [];
    }
    const snapshot = await getDocs(this.#query(criteria));
    try {
      return selectCareEventQueryResults(
        snapshot.docs.map(item => this.#decode(item, criteria.groupId)),
        criteria,
      );
    } catch (error) {
      throw this.#report(error);
    }
  }

  observe(
    criteria: CareEventQuery,
    listener: Parameters<CareEventRemoteStorePort['observe']>[1],
  ): () => void {
    if (criteria.kinds?.length === 0) {
      listener({kind: 'server_snapshot', events: []});
      return () => undefined;
    }
    return onSnapshot(
      this.#query(criteria),
      {includeMetadataChanges: true},
      snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          return;
        }
        try {
          listener(
            {
              kind: 'server_snapshot',
              events: selectCareEventQueryResults(
                snapshot.docs.map(item => this.#decode(item, criteria.groupId)),
                criteria,
              ),
            },
          );
        } catch (error) {
          // A poisoned or stale schema document must not silently lower
          // timeline/statistics totals by emitting a partial snapshot.
          const normalized = this.#report(error);
          listener({
            kind: 'error',
            error: {code: 'invalid', cause: normalized},
          });
        }
      },
      error => {
        // Never synthesize an empty data snapshot from an error. The session
        // lifecycle verifies membership revocation before purging local data.
        const remoteError = normalizeCareEventRemoteError(error);
        this.#report(error);
        listener({kind: 'error', error: remoteError});
      },
    );
  }
}
