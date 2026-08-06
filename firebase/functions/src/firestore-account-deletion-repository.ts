import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
} from 'firebase-admin/firestore';

import { AccountDeletionError } from './account-deletion-error.js';
import type {
  AccountDataDeletionRepository,
  AccountDataDeletionResult,
} from './account-deletion-service.js';

export interface GroupStorageDeletionRepository {
  deleteGroupFiles(groupId: string): Promise<void>;
}

async function queryDocumentPaths(query: Query): Promise<readonly string[]> {
  const snapshot = await query.get();
  return snapshot.docs.map((document) => document.ref.path);
}

async function queryDocumentPathsForValues(
  query: Query,
  field: string,
  values: readonly string[],
): Promise<readonly string[]> {
  const paths: string[] = [];
  for (let start = 0; start < values.length; start += 30) {
    paths.push(
      ...(await queryDocumentPaths(
        query.where(field, 'in', values.slice(start, start + 30)),
      )),
    );
  }
  return paths;
}

async function deletePaths(
  firestore: Firestore,
  paths: Iterable<string>,
): Promise<void> {
  const unique = [...new Set(paths)];
  for (let start = 0; start < unique.length; start += 400) {
    const batch = firestore.batch();
    for (const path of unique.slice(start, start + 400)) {
      batch.delete(firestore.doc(path));
    }
    await batch.commit();
  }
}

function membershipGroup(
  membership: DocumentSnapshot,
): { readonly groupId: string; readonly groupRef: DocumentReference } {
  const groupRef = membership.ref.parent.parent;
  if (!groupRef || groupRef.parent.id !== 'groups') {
    throw new AccountDeletionError(
      'failed-precondition',
      'Account membership is outside the groups collection',
    );
  }
  return { groupId: groupRef.id, groupRef };
}

export class FirestoreAccountDeletionRepository
implements AccountDataDeletionRepository {
  constructor(
    private readonly firestore: Firestore,
    private readonly storage: GroupStorageDeletionRepository,
  ) {}

  async deleteAccountData(
    uid: string,
    deletedAt: number,
  ): Promise<AccountDataDeletionResult> {
    const memberships = await this.firestore
      .collectionGroup('members')
      .where('userId', '==', uid)
      .get();
    let deletedGroups = 0;
    let deletedMemberships = 0;

    for (const membership of memberships.docs) {
      const { groupId, groupRef } = membershipGroup(membership);
      const role = membership.data().membershipRole;
      if (role === 'owner') {
        const group = await groupRef.get();
        if (!group.exists || group.data()?.ownerId !== uid) {
          throw new AccountDeletionError(
            'failed-precondition',
            'Owner membership does not match the current group owner',
          );
        }
        await this.storage.deleteGroupFiles(groupId);
        const relatedPaths = await Promise.all([
          queryDocumentPaths(
            this.firestore.collection('invites').where('groupId', '==', groupId),
          ),
          queryDocumentPaths(
            this.firestore.collection('auditLogs').where('groupId', '==', groupId),
          ),
        ]);
        await deletePaths(this.firestore, relatedPaths.flat());
        await this.firestore.doc(`groupTombstones/${groupId}`).set({
          id: groupId,
          deletedAt,
          reason: 'owner_account_deleted',
        });
        await this.firestore.recursiveDelete(groupRef);
        deletedGroups += 1;
        deletedMemberships += 1;
        continue;
      }
      if (role !== 'member') {
        throw new AccountDeletionError(
          'failed-precondition',
          'Account membership role is invalid',
        );
      }

      const authoredEvents = await groupRef
        .collection('events')
        .where('caregiverId', '==', uid)
        .get();
      const authoredEventIds = new Set(
        authoredEvents.docs.map((document) => document.id),
      );
      const activeSleeps = await groupRef.collection('activeSleeps').get();
      const receiptPaths = await queryDocumentPaths(
        groupRef.collection('eventMutationReceipts').where('actorUid', '==', uid),
      );
      const authoredEventReceiptPaths = await queryDocumentPathsForValues(
        groupRef.collection('eventMutationReceipts'),
        'eventId',
        [...authoredEventIds],
      );
      await deletePaths(this.firestore, [
        ...authoredEvents.docs.map((document) => document.ref.path),
        ...activeSleeps.docs
          .filter((document) => authoredEventIds.has(String(document.data().eventId)))
          .map((document) => document.ref.path),
        ...receiptPaths,
        ...authoredEventReceiptPaths,
        membership.ref.path,
      ]);
      deletedMemberships += 1;
    }

    const globalPaths = await Promise.all([
      queryDocumentPaths(
        this.firestore.collection('invites').where('createdByUid', '==', uid),
      ),
      queryDocumentPaths(
        this.firestore.collection('invites').where('acceptedByUid', '==', uid),
      ),
      queryDocumentPaths(
        this.firestore.collection('auditLogs').where('actorUid', '==', uid),
      ),
      queryDocumentPaths(
        this.firestore.collection('auditLogs').where('targetUid', '==', uid),
      ),
      queryDocumentPaths(
        this.firestore.collection('auditLogs').where('invitedByUid', '==', uid),
      ),
    ]);
    await deletePaths(this.firestore, globalPaths.flat());
    await Promise.all([
      this.firestore.recursiveDelete(
        this.firestore.doc(`functionRateLimits/${uid}`),
      ),
      this.firestore.recursiveDelete(this.firestore.doc(`users/${uid}`)),
    ]);

    return { deletedGroups, deletedMemberships };
  }
}
