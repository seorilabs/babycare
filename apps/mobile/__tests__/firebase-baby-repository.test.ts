import {doc, updateDoc} from '@react-native-firebase/firestore';
import {babyId, groupId} from '@babycare/product-core';

import {FirebaseBabyRepository} from '../src/adapters/firebase/firebase-baby-repository';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(async () => undefined),
}));

describe('FirebaseBabyRepository', () => {
  it('updates only the editable profile fields', async () => {
    const reference = {path: 'groups/group-1/babies/baby-1'};
    jest.mocked(doc).mockReturnValue(reference as never);
    const repository = new FirebaseBabyRepository({} as never);

    await repository.updateProfile({
      id: babyId('baby-1'),
      groupId: groupId('group-1'),
      name: '새봄',
      birthDate: '2024-02-29',
      updatedAt: 1_725_000_000_000,
    });

    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      'groups',
      groupId('group-1'),
      'babies',
      babyId('baby-1'),
    );
    expect(updateDoc).toHaveBeenCalledWith(reference, {
      name: '새봄',
      birthDate: '2024-02-29',
      updatedAt: 1_725_000_000_000,
    });
  });
});
