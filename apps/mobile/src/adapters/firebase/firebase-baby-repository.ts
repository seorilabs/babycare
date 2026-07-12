import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type Firestore,
} from '@react-native-firebase/firestore';
import type {Baby, BabyId, BabyRepositoryPort, GroupId} from '@babycare/product-core';

import {decodeBaby, encodeBabyDocument} from './group-documents';

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

  async save(baby: Baby): Promise<void> {
    await setDoc(
      doc(this.#firestore, 'groups', baby.groupId, 'babies', baby.id),
      encodeBabyDocument(baby),
    );
  }
}
