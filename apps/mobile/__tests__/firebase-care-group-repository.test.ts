import {
  getDocs,
  getDocsFromServer,
} from '@react-native-firebase/firestore';
import {userId} from '@babycare/product-core';

import {FirebaseCareGroupRepository} from '../src/adapters/firebase/firebase-care-group-repository';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  collectionGroup: jest.fn(() => ({path: 'members'})),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getDocsFromServer: jest.fn(async () => ({docs: []})),
  onSnapshot: jest.fn(),
  query: jest.fn(value => value),
  where: jest.fn(() => ({field: 'userId'})),
  writeBatch: jest.fn(),
}));

describe('FirebaseCareGroupRepository', () => {
  it('uses a server-only membership query for revocation verification', async () => {
    const repository = new FirebaseCareGroupRepository({} as never);

    await expect(repository.listForUser(userId('user-1'))).resolves.toEqual([]);

    expect(getDocsFromServer).toHaveBeenCalledTimes(1);
    expect(getDocs).not.toHaveBeenCalled();
  });
});
