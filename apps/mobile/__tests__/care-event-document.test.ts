import {
  careEventMutationId,
  careEventPayloadHash,
} from '@babycare/product-data';

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

  it('round-trips temperature and medication event fields', () => {
    const base = {
      groupId: valid.groupId,
      babyId: valid.babyId,
      caregiverId: valid.caregiverId,
      occurredAt: valid.occurredAt,
      createdAt: valid.createdAt,
      updatedAt: valid.updatedAt,
      revision: valid.revision,
      isDeleted: valid.isDeleted,
    };
    const temperature = decodeCareEventDocument({
      documentId: 'event-temperature',
      groupId: 'group-1',
      data: {
        ...base,
        id: 'event-temperature',
        kind: 'temperature',
        temperatureCelsius: 38.2,
        measurementSite: 'ear',
      },
    });
    const medication = decodeCareEventDocument({
      documentId: 'event-medication',
      groupId: 'group-1',
      data: {
        ...base,
        id: 'event-medication',
        kind: 'medication',
        medicationName: '아세트아미노펜',
        medicationCategory: 'antipyretic',
        activeIngredient: 'acetaminophen',
        doseAmount: 3.5,
        doseUnit: 'ml',
        minimumIntervalMinutes: 240,
      },
    });

    expect(temperature).toMatchObject({
      kind: 'temperature',
      temperatureCelsius: 38.2,
      measurementSite: 'ear',
    });
    expect(medication).toMatchObject({
      kind: 'medication',
      medicationName: '아세트아미노펜',
      doseAmount: 3.5,
      minimumIntervalMinutes: 240,
    });
    expect(encodeCareEventDocument(temperature)).toMatchObject({
      temperatureCelsius: 38.2,
      measurementSite: 'ear',
    });
  });

  it('keeps path-bound mutation metadata without trusting client hash content', () => {
    const event = decodeCareEventDocument({
      documentId: 'event-1',
      groupId: 'group-1',
      data: valid,
    });
    const mutation = {
      id: careEventMutationId(event),
      payloadHash: careEventPayloadHash(event),
    };
    const encoded = encodeCareEventDocument(event, mutation);

    expect(encoded).toMatchObject({
      lastMutationId: mutation.id,
      payloadHash: mutation.payloadHash,
    });
    expect(
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: encoded,
      }),
    ).toEqual(event);
    const arbitraryHash = '0'.repeat(64);
    expect(
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {
          ...encoded,
          payloadHash: arbitraryHash,
          lastMutationId: `event-1@1@${arbitraryHash}`,
        },
      }),
    ).toEqual(event);
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...encoded, payloadHash: '0'.repeat(64)},
      }),
    ).toThrow(/mutation metadata/);
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
    expect(() =>
      decodeCareEventDocument({
        documentId: 'event-1',
        groupId: 'group-1',
        data: {...valid, updatedAt: 3_000},
      }),
    ).toThrow(/initial revision/);
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
    ).toThrow(/ahead/);
  });
});
