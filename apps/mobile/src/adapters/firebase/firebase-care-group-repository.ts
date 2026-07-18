import {
  default as firebaseFirestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  where,
  type Firestore,
} from '@react-native-firebase/firestore';
import type {
  CareGroup,
  CareGroupRepositoryPort,
  CareGroupSetup,
  GroupId,
  Membership,
  MembershipObservation,
  UserId,
} from '@babycare/product-core';

import {
  decodeCareGroup,
  decodeMembership,
  encodeBabyDocument,
  encodeGroupDocument,
  encodeMembershipDocument,
} from './group-documents';

export class FirebaseCareGroupRepository implements CareGroupRepositoryPort {
  readonly #firestore: Firestore;

  constructor(firestore: Firestore) {
    this.#firestore = firestore;
  }

  async createOwnerGroup(setup: CareGroupSetup): Promise<void> {
    if (
      setup.group.ownerId !== setup.ownerMembership.userId ||
      setup.group.id !== setup.ownerMembership.groupId ||
      setup.group.id !== setup.baby.groupId
    ) {
      throw new Error('Care group setup identities are inconsistent');
    }
    // RNFirebase's modular writeBatch wrapper calls `firestore.batch.call(...)`.
    // The dynamically configured emulator app does not expose that wrapper,
    // whereas the supported namespaced API does.
    const firestore = firebaseFirestore(this.#firestore.app);
    const batch = firestore.batch();
    const groupRef = firestore.collection('groups').doc(setup.group.id);
    batch.set(groupRef, encodeGroupDocument(setup.group));
    batch.set(
      groupRef.collection('members').doc(setup.ownerMembership.userId),
      encodeMembershipDocument(setup.ownerMembership),
    );
    batch.set(
      groupRef.collection('babies').doc(setup.baby.id),
      encodeBabyDocument(setup.baby),
    );
    await batch.commit();
  }

  async findById(id: GroupId): Promise<CareGroup | undefined> {
    const snapshot = await getDoc(doc(this.#firestore, 'groups', id));
    return snapshot.exists() ? decodeCareGroup(snapshot.id, snapshot.data()) : undefined;
  }

  async listForUser(user: UserId): Promise<readonly CareGroup[]> {
    // Permission-error recovery must not accept a stale membership cache.
    const memberships = await getDocsFromServer(
      query(collectionGroup(this.#firestore, 'members'), where('userId', '==', user)),
    );
    const groups = await Promise.all(
      memberships.docs.map(item => {
        const groupDocumentId = item.ref.parent.parent?.id;
        return groupDocumentId ? this.findById(groupDocumentId as GroupId) : undefined;
      }),
    );
    return groups.filter((group): group is CareGroup => Boolean(group));
  }

  async findMembership(group: GroupId, user: UserId): Promise<Membership | undefined> {
    const snapshot = await getDoc(
      doc(this.#firestore, 'groups', group, 'members', user),
    );
    return snapshot.exists()
      ? decodeMembership(group, snapshot.id, snapshot.data())
      : undefined;
  }

  observeMembership(
    group: GroupId,
    user: UserId,
    listener: (observation: MembershipObservation) => void,
  ): () => void {
    return onSnapshot(
      doc(this.#firestore, 'groups', group, 'members', user),
      {includeMetadataChanges: true},
      snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          return;
        }
        try {
          listener({
            kind: 'server_value',
            membership: snapshot.exists()
              ? decodeMembership(group, snapshot.id, snapshot.data())
              : undefined,
          });
        } catch (error) {
          listener({
            kind: 'error',
            error:
              error instanceof Error
                ? error
                : new Error('Membership document is invalid'),
          });
        }
      },
      error => listener({kind: 'error', error}),
    );
  }

  async listMemberships(group: GroupId): Promise<readonly Membership[]> {
    const snapshot = await getDocs(collection(this.#firestore, 'groups', group, 'members'));
    return snapshot.docs.map(item => decodeMembership(group, item.id, item.data()));
  }
}
