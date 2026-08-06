import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const indexes = JSON.parse(
  await readFile(new URL('../firebase/firestore.indexes.json', import.meta.url), 'utf8'),
);

test('members.userId collection-group query has an index', () => {
  const memberUserId = indexes.fieldOverrides?.find(
    override =>
      override.collectionGroup === 'members' && override.fieldPath === 'userId',
  );

  assert.ok(memberUserId, 'members.userId field override is required');
  const configuredIndexes = new Set(
    memberUserId.indexes?.map(index =>
      [index.queryScope, index.order ?? index.arrayConfig].join(':'),
    ),
  );

  assert.deepEqual(
    configuredIndexes,
    new Set([
      'COLLECTION:ASCENDING',
      'COLLECTION:DESCENDING',
      'COLLECTION:CONTAINS',
      'COLLECTION_GROUP:ASCENDING',
    ]),
    'members.userId must preserve inherited collection indexes when adding collection-group scope',
  );
  assert.ok(
    memberUserId.indexes?.some(
      index =>
        index.queryScope === 'COLLECTION_GROUP' &&
        (index.order === 'ASCENDING' || index.order === 'DESCENDING'),
    ),
    'members.userId requires an ordered COLLECTION_GROUP index',
  );
});
