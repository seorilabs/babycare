import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from '@react-native-firebase/firestore';
import type {
  CareGroup,
  CareGroupRepositoryPort,
  CareGroupSetup,
  GroupId,
  Membership,
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
    const batch = writeBatch(this.#firestore);
    const groupRef = doc(this.#firestore, 'groups', setup.group.id);
    batch.set(groupRef, encodeGroupDocument(setup.group));
    batch.set(
      doc(groupRef, 'members', setup.ownerMembership.userId),
      encodeMembershipDocument(setup.ownerMembership),
    );
    batch.set(doc(groupRef, 'babies', setup.baby.id), encodeBabyDocument(setup.baby));
    await batch.commit();
  }

  async findById(id: GroupId): Promise<CareGroup | undefined> {
    const snapshot = await getDoc(doc(this.#firestore, 'groups', id));
    return snapshot.exists() ? decodeCareGroup(snapshot.id, snapshot.data()) : undefined;
  }

  async listForUser(user: UserId): Promise<readonly CareGroup[]> {
    const memberships = await getDocs(
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

  async listMemberships(group: GroupId): Promise<readonly Membership[]> {
    const snapshot = await getDocs(collection(this.#firestore, 'groups', group, 'members'));
    return snapshot.docs.map(item => decodeMembership(group, item.id, item.data()));
  }
}
