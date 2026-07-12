import {
  decodeCareEventDocument,
  encodeCareEventDocument,
  selectCareEventQueryResults,
} from '../src/adapters/firebase/care-event-document';

describe('Firebase care event document mapper', () => {
  const valid = {
    id: 'event-1',
    groupId: 'group-1',
    babyId: 'baby-1',
    caregiverId: 'user-1',
    kind: 'feeding',
    feedingType: 'formula',
    volumeMl: 120,
    occurredAt: 1_000,
    createdAt: 2_000,
    updatedAt: 2_000,
    revision: 1,
    isDeleted: false,
  };

  it('validates and decodes a path-bound event', () => {
    const event = decodeCareEventDocument({
      documentId: 'event-1',
      groupId: 'group-1',
      data: valid,
    });
    expect(event.kind).toBe('feeding');
    expect(encodeCareEventDocument(event)).toMatchObject(valid);
  });

  it('rejects identity and schema poisoning before it reaches product core', () => {
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-2',
        groupId: 'group-1',
        data: valid,
      }),
    ).toThrow(/identity/);
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...valid, volumeMl: 0},
      }),
    ).toThrow(/volumeMl/);
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...valid, diagnosis: 'poisoned'},
      }),
    ).toThrow(/unexpected/);
  });

  it('applies visibility before a result limit', () => {
    const live = decodeCareEventDocument({
      documentId: 'event-1',
      groupId: 'group-1',
      data: valid,
    });
    const deleted = decodeCareEventDocument({
      documentId: 'event-2',
      groupId: 'group-1',
      data: {
        ...valid,
        id: 'event-2',
        updatedAt: 3_000,
        deletedAt: 3_000,
        revision: 2,
        isDeleted: true,
      },
    });

    expect(selectCareEventQueryResults([deleted, live], {limit: 1})).toEqual([live]);
  });

  it('accepts a later edited occurrence time within the server clock skew', () => {
    expect(
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...valid, occurredAt: 14_000, updatedAt: 10_000, revision: 2},
      }).occurredAt,
    ).toBe(14_000);
  });

  it('rejects inconsistent deletion and audit metadata explicitly', () => {
    for (const data of [
      {...valid, isDeleted: true},
      {...valid, deletedAt: 2_000},
    ]) {
      expect(() =>
        decodeCareEventDocument({
          documentId: 'event-1',
          groupId: 'group-1',
          data,
        }),
      ).toThrow(/deletion state/);
    }
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...valid, updatedAt: 1_999},
      }),
    ).toThrow(/updatedAt/);
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {
          ...valid,
          updatedAt: 3_000,
          deletedAt: 2_500,
          isDeleted: true,
          revision: 2,
        },
      }),
    ).toThrow(/deletedAt/);
  });

  it('rejects invalid revision and occurrence audit boundaries', () => {
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...valid, revision: 0},
      }),
    ).toThrow(/revision/);
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...valid, occurredAt: 302_001},
      }),
    ).toThrow(/future/);
  });
});
