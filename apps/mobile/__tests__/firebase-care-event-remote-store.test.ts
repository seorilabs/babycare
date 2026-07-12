import {
  documentId,
  getDocsFromServer,
  limit as limitQuery,
  onSnapshot,
  orderBy,
  startAfter,
  where,
} from '@react-native-firebase/firestore';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
  type CareEventMutation,
} from '@babycare/product-core';
import {
  careEventMutationId,
  careEventPayloadHash,
} from '@babycare/product-data';

import {encodeCareEventDocument} from '../src/adapters/firebase/care-event-document';
import {FirebaseCareEventRemoteStore} from '../src/adapters/firebase/firebase-care-event-repository';

type StoredDocument = Record<string, unknown>;

const mockDocuments = new Map<string, StoredDocument>();
const mockWrites: {
  operation: 'set' | 'delete';
  path: string;
  data?: StoredDocument;
}[] = [];

function mockReferencePath(parent: unknown, segments: readonly string[]): string {
  const base =
    parent && typeof parent === 'object' && 'path' in parent
      ? String(parent.path)
      : '';
  return [base, ...segments].filter(Boolean).join('/');
}

const mockTransaction = {
  async get(reference: {readonly path: string}) {
    const value = mockDocuments.get(reference.path);
    return {
      id: reference.path.split('/').at(-1)!,
      exists: () => value !== undefined,
      data: () => value,
    };
  },
  set(reference: {readonly path: string}, data: StoredDocument) {
    mockWrites.push({operation: 'set', path: reference.path, data});
    mockDocuments.set(reference.path, data);
  },
  delete(reference: {readonly path: string}) {
    mockWrites.push({operation: 'delete', path: reference.path});
    mockDocuments.delete(reference.path);
  },
};

jest.mock('@react-native-firebase/firestore', () => ({
  collection: (parent: unknown, ...segments: string[]) => ({
    path: mockReferencePath(parent, segments),
  }),
  documentId: jest.fn(() => '__name__'),
  doc: (parent: unknown, ...segments: string[]) => ({
    path: mockReferencePath(parent, segments),
  }),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getDocsFromServer: jest.fn(),
  limit: jest.fn(value => ({kind: 'limit', value})),
  onSnapshot: jest.fn(() => jest.fn()),
  orderBy: jest.fn((field, direction) => ({
    kind: 'orderBy',
    field,
    direction,
  })),
  query: jest.fn((base, ...constraints) => ({
    ...base,
    constraints: [...(base.constraints ?? []), ...constraints],
  })),
  runTransaction: jest.fn(async (_firestore, callback) =>
    callback(mockTransaction),
  ),
  serverTimestamp: jest.fn(() => ({__serverTimestamp: true})),
  startAfter: jest.fn((...values) => ({kind: 'startAfter', values})),
  where: jest.fn((field, operator, value) => ({
    kind: 'where',
    field,
    operator,
    value,
  })),
}));

const ids = {
  groupId: groupId('group-1'),
  babyId: babyId('baby-1'),
  caregiverId: userId('user-1'),
};

function diaper(): Extract<CareEvent, {kind: 'diaper'}> {
  return createCareEvent(
    {...ids, kind: 'diaper', diaperType: 'wet', occurredAt: 1_000},
    {id: eventId('event-diaper'), now: 2_000},
  ) as Extract<CareEvent, {kind: 'diaper'}>;
}

function diaperAt(
  id: string,
  occurredAt: number,
  deleted = false,
): Extract<CareEvent, {kind: 'diaper'}> {
  const event = createCareEvent(
    {...ids, kind: 'diaper', diaperType: 'wet', occurredAt},
    {id: eventId(id), now: occurredAt + 1_000},
  ) as Extract<CareEvent, {kind: 'diaper'}>;
  return deleted
    ? {...event, deletedAt: occurredAt + 2_000, updatedAt: occurredAt + 2_000, revision: 2}
    : event;
}

function queryDocument(event: CareEvent) {
  return {
    id: event.id,
    data: () => encodeCareEventDocument(event),
  };
}

function sleep(id: string): Extract<CareEvent, {kind: 'sleep'}> {
  return createCareEvent(
    {...ids, kind: 'sleep', sleepType: 'night', startedAt: 1_000},
    {id: eventId(id), now: 2_000},
  ) as Extract<CareEvent, {kind: 'sleep'}>;
}

function mutation(
  event: CareEvent,
  kind: CareEventMutation['kind'],
): CareEventMutation {
  return {
    id: careEventMutationId(event),
    kind,
    event,
    baseRevision: event.revision - 1,
    payloadHash: careEventPayloadHash(event),
  };
}

function remoteStore(onDecodeError: (error: Error) => void = jest.fn()) {
  return new FirebaseCareEventRemoteStore(
    {} as never,
    ids.caregiverId,
    onDecodeError,
  );
}

describe('Firebase care event remote transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocuments.clear();
    mockWrites.length = 0;
  });

  it('atomically writes a new event and its deterministic receipt', async () => {
    const event = diaper();
    await expect(remoteStore().push(mutation(event, 'create'))).resolves.toEqual({
      kind: 'applied',
      remote: event,
    });

    expect(mockWrites.map(write => write.path)).toEqual([
      `groups/${ids.groupId}/events/${event.id}`,
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(event)}`,
    ]);
    expect(mockWrites[0]?.data).toMatchObject({
      lastMutationId: careEventMutationId(event),
      payloadHash: careEventPayloadHash(event),
    });
    expect(mockWrites[1]?.data?.payload).toEqual(mockWrites[0]?.data);
  });

  it('uses a receipt as lost-ack proof even after a later revision exists', async () => {
    const first = diaper();
    const later = {
      ...first,
      diaperType: 'dirty',
      revision: 2,
      updatedAt: 3_000,
    } satisfies CareEvent;
    mockDocuments.set(
      `groups/${ids.groupId}/events/${first.id}`,
      encodeCareEventDocument(later, {
        id: careEventMutationId(later),
        payloadHash: careEventPayloadHash(later),
      }),
    );
    mockDocuments.set(
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(first)}`,
      {
        id: careEventMutationId(first),
        groupId: ids.groupId,
        babyId: ids.babyId,
        eventId: first.id,
        revision: 1,
        payloadHash: careEventPayloadHash(first),
        kind: 'create',
        actorUid: ids.caregiverId,
        appliedAt: 2_000,
        payload: encodeCareEventDocument(first, {
          id: careEventMutationId(first),
          payloadHash: careEventPayloadHash(first),
        }),
      },
    );

    await expect(remoteStore().push(mutation(first, 'create'))).resolves.toEqual({
      kind: 'already_applied',
      remote: later,
    });
    expect(mockWrites).toEqual([]);
  });

  it('returns a conflict when a receipt exists but the same revision payload diverges', async () => {
    const local = diaper();
    const divergent = {
      ...local,
      diaperType: 'dirty',
    } satisfies CareEvent;
    mockDocuments.set(
      `groups/${ids.groupId}/events/${local.id}`,
      encodeCareEventDocument(divergent),
    );
    mockDocuments.set(
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(local)}`,
      {
        id: careEventMutationId(local),
        groupId: ids.groupId,
        babyId: ids.babyId,
        eventId: local.id,
        revision: local.revision,
        payloadHash: careEventPayloadHash(local),
        kind: 'create',
        actorUid: ids.caregiverId,
        appliedAt: 2_000,
        payload: encodeCareEventDocument(local, {
          id: careEventMutationId(local),
          payloadHash: careEventPayloadHash(local),
        }),
      },
    );

    await expect(remoteStore().push(mutation(local, 'create'))).resolves.toEqual(
      {kind: 'revision_conflict', remote: divergent},
    );
    expect(mockWrites).toEqual([]);
  });

  it('rejects a receipt written by a different actor', async () => {
    const event = diaper();
    mockDocuments.set(
      `groups/${ids.groupId}/events/${event.id}`,
      encodeCareEventDocument(event),
    );
    mockDocuments.set(
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(event)}`,
      {
        id: careEventMutationId(event),
        groupId: ids.groupId,
        babyId: ids.babyId,
        eventId: event.id,
        revision: event.revision,
        payloadHash: careEventPayloadHash(event),
        kind: 'create',
        actorUid: userId('other-user'),
        appliedAt: 2_000,
        payload: encodeCareEventDocument(event, {
          id: careEventMutationId(event),
          payloadHash: careEventPayloadHash(event),
        }),
      },
    );

    await expect(remoteStore().push(mutation(event, 'create'))).rejects.toMatchObject(
      {remoteError: {code: 'invalid'}},
    );
    expect(mockWrites).toEqual([]);
  });

  it('treats equal remote data without an immutable receipt as a conflict', async () => {
    const event = diaper();
    mockDocuments.set(
      `groups/${ids.groupId}/events/${event.id}`,
      encodeCareEventDocument(event),
    );

    await expect(remoteStore().push(mutation(event, 'create'))).resolves.toEqual({
      kind: 'revision_conflict',
      remote: event,
    });
    expect(mockWrites).toEqual([]);
  });

  it('creates the active-sleep singleton lock with an active sleep event', async () => {
    const event = sleep('sleep-local');
    await remoteStore().push(mutation(event, 'create'));

    expect(mockWrites.map(write => write.path)).toEqual([
      `groups/${ids.groupId}/events/${event.id}`,
      `groups/${ids.groupId}/activeSleeps/${ids.babyId}`,
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(event)}`,
    ]);
  });

  it('returns the server active sleep instead of overwriting its singleton lock', async () => {
    const local = sleep('sleep-local');
    const server = sleep('sleep-server');
    mockDocuments.set(
      `groups/${ids.groupId}/events/${server.id}`,
      encodeCareEventDocument(server),
    );
    mockDocuments.set(
      `groups/${ids.groupId}/activeSleeps/${ids.babyId}`,
      {
        groupId: ids.groupId,
        babyId: ids.babyId,
        eventId: server.id,
        caregiverId: server.caregiverId,
        startedAt: server.startedAt,
        createdAt: server.createdAt,
      },
    );

    await expect(remoteStore().push(mutation(local, 'create'))).resolves.toEqual({
      kind: 'active_sleep_conflict',
      remoteActiveSleep: server,
    });
    expect(mockWrites).toEqual([]);
  });

  it('removes the matching active lock when a sleep is ended', async () => {
    const started = sleep('sleep-ending');
    const ended = {
      ...started,
      endedAt: 3_000,
      updatedAt: 3_000,
      revision: 2,
    } satisfies CareEvent;
    mockDocuments.set(
      `groups/${ids.groupId}/events/${started.id}`,
      encodeCareEventDocument(started),
    );
    mockDocuments.set(
      `groups/${ids.groupId}/activeSleeps/${ids.babyId}`,
      {
        groupId: ids.groupId,
        babyId: ids.babyId,
        eventId: started.id,
        caregiverId: started.caregiverId,
        startedAt: started.startedAt,
        createdAt: started.createdAt,
      },
    );

    await remoteStore().push(mutation(ended, 'end_sleep'));

    expect(mockWrites).toContainEqual({
      operation: 'delete',
      path: `groups/${ids.groupId}/activeSleeps/${ids.babyId}`,
    });
  });

  it('fetches a raw server page with stable equal-timestamp ordering and lookahead', async () => {
    const newestById = diaperAt('event-z', 4_000);
    const deletedMiddle = diaperAt('event-y', 4_000, true);
    const lookahead = diaperAt('event-x', 4_000);
    const getDocsFromServerMock = getDocsFromServer as jest.Mock;
    getDocsFromServerMock.mockResolvedValue({
      docs: [
        queryDocument(newestById),
        queryDocument(deletedMiddle),
        queryDocument(lookahead),
      ],
    });

    await expect(
      remoteStore().fetchPage({
        ...ids,
        from: 1_000,
        to: 5_000,
        kinds: ['diaper'],
        pageSize: 2,
      }),
    ).resolves.toEqual({
      events: [newestById, deletedMiddle],
      endCursor: {occurredAt: 4_000, eventId: deletedMiddle.id},
      hasMore: true,
    });

    expect(getDocsFromServerMock).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenNthCalledWith(1, 'babyId', '==', ids.babyId);
    expect(where).toHaveBeenNthCalledWith(2, 'occurredAt', '>=', 1_000);
    expect(where).toHaveBeenNthCalledWith(3, 'occurredAt', '<', 5_000);
    expect(where).toHaveBeenNthCalledWith(4, 'kind', '==', 'diaper');
    expect(orderBy).toHaveBeenNthCalledWith(1, 'occurredAt', 'desc');
    expect(documentId).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenNthCalledWith(2, '__name__', 'desc');
    expect(startAfter).not.toHaveBeenCalled();
    expect(limitQuery).toHaveBeenCalledWith(3);
  });

  it('applies the scalar cursor after both stable ordering fields', async () => {
    const getDocsFromServerMock = getDocsFromServer as jest.Mock;
    getDocsFromServerMock.mockResolvedValue({docs: []});
    const cursor = {occurredAt: 4_000, eventId: eventId('event-y')};

    await expect(
      remoteStore().fetchPage({
        ...ids,
        pageSize: 20,
        after: cursor,
      }),
    ).resolves.toEqual({events: [], hasMore: false});

    expect(orderBy).toHaveBeenNthCalledWith(1, 'occurredAt', 'desc');
    expect(orderBy).toHaveBeenNthCalledWith(2, '__name__', 'desc');
    expect(startAfter).toHaveBeenCalledWith(4_000, cursor.eventId);
    expect(limitQuery).toHaveBeenCalledWith(21);
  });

  it('returns typed one-shot errors and never returns a partial poisoned page', async () => {
    const getDocsFromServerMock = getDocsFromServer as jest.Mock;
    getDocsFromServerMock.mockRejectedValueOnce({
      code: 'firestore/unavailable',
    });

    await expect(
      remoteStore().fetchPage({...ids, pageSize: 10}),
    ).rejects.toMatchObject({remoteError: {code: 'retryable'}});

    const valid = diaperAt('event-valid', 4_000);
    const onDecodeError = jest.fn();
    getDocsFromServerMock.mockResolvedValueOnce({
      docs: [
        queryDocument(valid),
        {id: 'event-poisoned', data: () => ({kind: 'diaper'})},
      ],
    });
    await expect(
      remoteStore(onDecodeError).fetchPage({...ids, pageSize: 10}),
    ).rejects.toMatchObject({remoteError: {code: 'invalid'}});
    expect(onDecodeError).toHaveBeenCalledTimes(1);
  });

  it('observes only server-confirmed pages and reports typed transport errors', () => {
    const first = diaperAt('event-z', 4_000);
    const lookahead = diaperAt('event-y', 4_000);
    const observations: unknown[] = [];
    remoteStore().observePage(
      {...ids, pageSize: 1},
      observation => observations.push(observation),
    );
    const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;
    const call = onSnapshotMock.mock.calls.at(-1)!;
    const onNext = call[2] as (snapshot: unknown) => void;
    const onError = call[3] as (error: unknown) => void;
    const docs = [queryDocument(first), queryDocument(lookahead)];

    onNext({metadata: {fromCache: true, hasPendingWrites: false}, docs});
    onNext({metadata: {fromCache: false, hasPendingWrites: true}, docs});
    expect(observations).toEqual([]);

    onNext({metadata: {fromCache: false, hasPendingWrites: false}, docs});
    expect(observations).toEqual([
      {
        kind: 'server_page',
        page: {
          events: [first],
          endCursor: {occurredAt: first.occurredAt, eventId: first.id},
          hasMore: true,
        },
      },
    ]);

    onError({code: 'firestore/permission-denied'});
    expect(observations.at(-1)).toMatchObject({
      kind: 'error',
      error: {code: 'permission_denied'},
    });
  });

  it('reports an invalid observed document without emitting a partial page', () => {
    const valid = diaperAt('event-valid', 4_000);
    const onDecodeError = jest.fn();
    const observations: unknown[] = [];
    remoteStore(onDecodeError).observePage(
      {...ids, pageSize: 10},
      observation => observations.push(observation),
    );
    const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;
    const call = onSnapshotMock.mock.calls.at(-1)!;
    const onNext = call[2] as (snapshot: unknown) => void;

    onNext({
      metadata: {fromCache: false, hasPendingWrites: false},
      docs: [
        queryDocument(valid),
        {id: 'event-poisoned', data: () => ({kind: 'diaper'})},
      ],
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      kind: 'error',
      error: {code: 'invalid'},
    });
    expect(onDecodeError).toHaveBeenCalledTimes(1);
  });

  it('reconciles only server-confirmed snapshots and reports errors separately', () => {
    const event = diaper();
    const observations: unknown[] = [];
    remoteStore().observe(ids, observation => observations.push(observation));
    const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;
    const call = onSnapshotMock.mock.calls.at(-1)!;
    const onNext = call[2] as (snapshot: unknown) => void;
    const onError = call[3] as (error: unknown) => void;

    onNext({
      metadata: {fromCache: true, hasPendingWrites: false},
      docs: [
        {
          id: event.id,
          data: () => encodeCareEventDocument(event),
        },
      ],
    });
    expect(observations).toEqual([]);

    onNext({
      metadata: {fromCache: false, hasPendingWrites: false},
      docs: [
        {
          id: event.id,
          data: () => encodeCareEventDocument(event),
        },
      ],
    });
    expect(observations).toEqual([
      {kind: 'server_snapshot', events: [event]},
    ]);

    onError({code: 'firestore/permission-denied'});
    expect(observations.at(-1)).toMatchObject({
      kind: 'error',
      error: {code: 'permission_denied'},
    });
  });
});
