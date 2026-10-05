import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  type Firestore,
} from '@react-native-firebase/firestore';
import type {
  Baby,
  BabyId,
  BabyProfileUpdate,
  BabyRepositoryPort,
  GroupId,
} from '@babycare/product-core';

import {decodeBaby} from './group-documents';

export class FirebaseBabyRepository implements BabyRepositoryPort {
  readonly #firestore: Firestore;

  constructor(firestore: Firestore) {
    this.#firestore = firestore;
  }

  async list(group: GroupId): Promise<readonly Baby[]> {
    const snapshot = await getDocs(collection(this.#firestore, 'groups', group, 'babies'));
    return snapshot.docs.map(item => decodeBaby(group, item.id, item.data()));
  }

  async findById(group: GroupId, baby: BabyId): Promise<Baby | undefined> {
    const snapshot = await getDoc(doc(this.#firestore, 'groups', group, 'babies', baby));
    return snapshot.exists() ? decodeBaby(group, snapshot.id, snapshot.data()) : undefined;
  }

  async updateProfile(profile: BabyProfileUpdate): Promise<void> {
    await updateDoc(
      doc(this.#firestore, 'groups', profile.groupId, 'babies', profile.id),
      {
        name: profile.name,
        birthDate: profile.birthDate,
        updatedAt: profile.updatedAt,
      },
    );
  }
}
