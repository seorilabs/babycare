import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitQuery,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from '@react-native-firebase/firestore';
import type {
  CareEvent,
  CareEventQuery,
  CareEventRemoteStorePort,
  EventId,
  GroupId,
} from '@babycare/product-core';

import {
  decodeCareEventDocument,
  encodeCareEventDocument,
  selectCareEventQueryResults,
} from './care-event-document';

/**
 * Remote Firestore transport. This is intentionally not a UI repository:
 * Firestore write promises resolve on server acknowledgement, so production
 * composition must place a durable local repository/outbox in front of it.
 */
export class FirebaseCareEventRemoteStore implements CareEventRemoteStorePort {
  readonly #firestore: Firestore;
  readonly #onDecodeError: (error: Error) => void;

  constructor(firestore: Firestore, onDecodeError: (error: Error) => void) {
    this.#firestore = firestore;
    this.#onDecodeError = onDecodeError;
  }

  #collection(group: GroupId) {
    return collection(this.#firestore, 'groups', group, 'events');
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

  async push(event: CareEvent): Promise<void> {
    await setDoc(
      doc(this.#collection(event.groupId), event.id),
      encodeCareEventDocument(event),
    );
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
    listener: (events: readonly CareEvent[]) => void,
  ): () => void {
    if (criteria.kinds?.length === 0) {
      listener([]);
      return () => undefined;
    }
    return onSnapshot(
      this.#query(criteria),
      snapshot => {
        try {
          listener(
            selectCareEventQueryResults(
              snapshot.docs.map(item => this.#decode(item, criteria.groupId)),
              criteria,
            ),
          );
        } catch (error) {
          // A poisoned or stale schema document must not silently lower
          // timeline/statistics totals by emitting a partial snapshot.
          listener([]);
          this.#report(error);
        }
      },
      error => {
        // A revoked membership must not leave the last sensitive snapshot on
        // screen while the caller handles the authorization error.
        listener([]);
        this.#report(error);
      },
    );
  }
}
