import {
  documentId,
  getDocFromServer,
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

function mockReferencePath(
  parent: unknown,
  segments: readonly string[],
): string {
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
  getDocFromServer: jest.fn(),
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
    ? {
        ...event,
        deletedAt: occurredAt + 2_000,
        updatedAt: occurredAt + 2_000,
        revision: 2,
      }
    : event;
}

function queryDocument(event: CareEvent) {
  return {
    id: event.id,
    data: () => encodeCareEventDocument(event),
  };
}

function documentSnapshot(
  id: string,
  data: StoredDocument | undefined,
  metadata = {fromCache: false, hasPendingWrites: false},
) {
  return {
    id,
    exists: () => data !== undefined,
    data: () => data,
    metadata,
  };
}

function sleep(id: string): Extract<CareEvent, {kind: 'sleep'}> {
  return createCareEvent(
    {...ids, kind: 'sleep', sleepType: 'night', startedAt: 1_000},
    {id: eventId(id), now: 2_000},
  ) as Extract<CareEvent, {kind: 'sleep'}>;
}

function activeSleepLock(
  event: Extract<CareEvent, {kind: 'sleep'}>,
  overrides: Partial<StoredDocument> = {},
): StoredDocument {
  return {
    groupId: event.groupId,
    babyId: event.babyId,
    eventId: event.id,
    caregiverId: event.caregiverId,
    startedAt: event.startedAt,
    createdAt: event.createdAt,
    ...overrides,
  };
}

function observedSnapshotCall(path: string) {
  const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;
  for (
    let index = onSnapshotMock.mock.calls.length - 1;
    index >= 0;
    index -= 1
  ) {
    const reference = onSnapshotMock.mock.calls[index]?.[0] as
      | {readonly path?: string}
      | undefined;
    if (reference?.path === path) {
      return {
        call: onSnapshotMock.mock.calls[index]!,
        stop: onSnapshotMock.mock.results[index]?.value as jest.Mock,
      };
    }
  }
  throw new Error(`Missing onSnapshot call for ${path}`);
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
    await expect(
      remoteStore().push(mutation(event, 'create')),
    ).resolves.toEqual({
      kind: 'applied',
      remote: event,
    });

    expect(mockWrites.map(write => write.path)).toEqual([
      `groups/${ids.groupId}/events/${event.id}`,
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(
        event,
      )}`,
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
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(
        first,
      )}`,
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

    await expect(
      remoteStore().push(mutation(first, 'create')),
    ).resolves.toEqual({
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
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(
        local,
      )}`,
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

    await expect(
      remoteStore().push(mutation(local, 'create')),
    ).resolves.toEqual({kind: 'revision_conflict', remote: divergent});
    expect(mockWrites).toEqual([]);
  });

  it('rejects a receipt written by a different actor', async () => {
    const event = diaper();
    mockDocuments.set(
      `groups/${ids.groupId}/events/${event.id}`,
      encodeCareEventDocument(event),
    );
    mockDocuments.set(
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(
        event,
      )}`,
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

    await expect(
      remoteStore().push(mutation(event, 'create')),
    ).rejects.toMatchObject({remoteError: {code: 'invalid'}});
    expect(mockWrites).toEqual([]);
  });

  it('treats equal remote data without an immutable receipt as a conflict', async () => {
    const event = diaper();
    mockDocuments.set(
      `groups/${ids.groupId}/events/${event.id}`,
      encodeCareEventDocument(event),
    );

    await expect(
      remoteStore().push(mutation(event, 'create')),
    ).resolves.toEqual({
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
      `groups/${ids.groupId}/eventMutationReceipts/${careEventMutationId(
        event,
      )}`,
    ]);
  });

  it('returns the server active sleep instead of overwriting its singleton lock', async () => {
    const local = sleep('sleep-local');
    const server = sleep('sleep-server');
    mockDocuments.set(
      `groups/${ids.groupId}/events/${server.id}`,
      encodeCareEventDocument(server),
    );
    mockDocuments.set(`groups/${ids.groupId}/activeSleeps/${ids.babyId}`, {
      groupId: ids.groupId,
      babyId: ids.babyId,
      eventId: server.id,
      caregiverId: server.caregiverId,
      startedAt: server.startedAt,
      createdAt: server.createdAt,
    });

    await expect(
      remoteStore().push(mutation(local, 'create')),
    ).resolves.toEqual({
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
    mockDocuments.set(`groups/${ids.groupId}/activeSleeps/${ids.babyId}`, {
      groupId: ids.groupId,
      babyId: ids.babyId,
      eventId: started.id,
      caregiverId: started.caregiverId,
      startedAt: started.startedAt,
      createdAt: started.createdAt,
    });

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
    remoteStore().observePage({...ids, pageSize: 1}, observation =>
      observations.push(observation),
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
    expect(observations).toEqual([{kind: 'server_snapshot', events: [event]}]);

    onError({code: 'firestore/permission-denied'});
    expect(observations.at(-1)).toMatchObject({
      kind: 'error',
      error: {code: 'permission_denied'},
    });
  });

  it('fetches a raw server window in stable order including tombstones', async () => {
    const newest = diaperAt('window-z', 4_000);
    const deleted = diaperAt('window-y', 4_000, true);
    const getDocsFromServerMock = getDocsFromServer as jest.Mock;
    getDocsFromServerMock.mockResolvedValue({
      docs: [queryDocument(newest), queryDocument(deleted)],
    });

    await expect(
      remoteStore().fetchWindow({
        ...ids,
        from: 1_000,
        to: 5_000,
        kinds: ['diaper'],
      }),
    ).resolves.toEqual([newest, deleted]);

    expect(getDocsFromServerMock).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenNthCalledWith(1, 'babyId', '==', ids.babyId);
    expect(where).toHaveBeenNthCalledWith(2, 'occurredAt', '>=', 1_000);
    expect(where).toHaveBeenNthCalledWith(3, 'occurredAt', '<', 5_000);
    expect(where).toHaveBeenNthCalledWith(4, 'kind', '==', 'diaper');
    expect(where).not.toHaveBeenCalledWith('isDeleted', '==', false);
    expect(orderBy).toHaveBeenNthCalledWith(1, 'occurredAt', 'desc');
    expect(orderBy).toHaveBeenNthCalledWith(2, '__name__', 'desc');
  });

  it('short-circuits an explicitly empty projection kind set', async () => {
    const observations: unknown[] = [];

    await expect(
      remoteStore().fetchWindow({...ids, from: 1_000, kinds: []}),
    ).resolves.toEqual([]);
    remoteStore().observeWindow(
      {...ids, from: 1_000, kinds: []},
      observation => observations.push(observation),
    );

    expect(observations).toEqual([{kind: 'server_value', events: []}]);
    expect(getDocsFromServer).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('fetches the latest nondeleted event through the indexed server query', async () => {
    const latest = diaperAt('latest-z', 4_000);
    const getDocsFromServerMock = getDocsFromServer as jest.Mock;
    getDocsFromServerMock
      .mockResolvedValueOnce({docs: [queryDocument(latest)]})
      .mockResolvedValueOnce({docs: []});

    await expect(
      remoteStore().fetchLatest({...ids, kind: 'diaper'}),
    ).resolves.toEqual(latest);
    await expect(
      remoteStore().fetchLatest({...ids, kind: 'sleep'}),
    ).resolves.toBeUndefined();

    expect(where).toHaveBeenNthCalledWith(1, 'babyId', '==', ids.babyId);
    expect(where).toHaveBeenNthCalledWith(2, 'isDeleted', '==', false);
    expect(where).toHaveBeenNthCalledWith(3, 'kind', '==', 'diaper');
    expect(orderBy).toHaveBeenNthCalledWith(1, 'occurredAt', 'desc');
    expect(orderBy).toHaveBeenNthCalledWith(2, '__name__', 'desc');
    expect(limitQuery).toHaveBeenNthCalledWith(1, 1);
  });

  it('rejects an entire poisoned or non-strict projection snapshot', async () => {
    const valid = diaperAt('projection-valid', 4_000);
    const older = diaperAt('projection-older', 3_000);
    const getDocsFromServerMock = getDocsFromServer as jest.Mock;
    const onDecodeError = jest.fn();
    getDocsFromServerMock
      .mockResolvedValueOnce({
        docs: [
          queryDocument(valid),
          {id: 'projection-poisoned', data: () => ({kind: 'diaper'})},
        ],
      })
      .mockResolvedValueOnce({
        docs: [queryDocument(older), queryDocument(valid)],
      });

    await expect(
      remoteStore(onDecodeError).fetchWindow({...ids, from: 1_000}),
    ).rejects.toMatchObject({remoteError: {code: 'invalid'}});
    await expect(
      remoteStore(onDecodeError).fetchWindow({...ids, from: 1_000}),
    ).rejects.toMatchObject({remoteError: {code: 'invalid'}});
    expect(onDecodeError).toHaveBeenCalledTimes(2);
  });

  it('observes only server-confirmed window and latest projection values', () => {
    const first = diaperAt('observe-z', 4_000);
    const deleted = diaperAt('observe-y', 4_000, true);
    const windowValues: unknown[] = [];
    remoteStore().observeWindow({...ids, from: 1_000}, observation =>
      windowValues.push(observation),
    );
    const onSnapshotMock = onSnapshot as jest.MockedFunction<typeof onSnapshot>;
    const windowCall = onSnapshotMock.mock.calls.at(-1)!;
    const nextWindow = windowCall[2] as (snapshot: unknown) => void;
    const windowDocs = [queryDocument(first), queryDocument(deleted)];

    nextWindow({
      metadata: {fromCache: true, hasPendingWrites: false},
      docs: windowDocs,
    });
    nextWindow({
      metadata: {fromCache: false, hasPendingWrites: true},
      docs: windowDocs,
    });
    expect(windowValues).toEqual([]);
    nextWindow({
      metadata: {fromCache: false, hasPendingWrites: false},
      docs: windowDocs,
    });
    expect(windowValues).toEqual([
      {kind: 'server_value', events: [first, deleted]},
    ]);

    const latestValues: unknown[] = [];
    remoteStore().observeLatest({...ids, kind: 'diaper'}, observation =>
      latestValues.push(observation),
    );
    const latestCall = onSnapshotMock.mock.calls.at(-1)!;
    const nextLatest = latestCall[2] as (snapshot: unknown) => void;
    nextLatest({
      metadata: {fromCache: true, hasPendingWrites: false},
      docs: [queryDocument(first)],
    });
    nextLatest({
      metadata: {fromCache: false, hasPendingWrites: true},
      docs: [queryDocument(first)],
    });
    expect(latestValues).toEqual([]);
    nextLatest({
      metadata: {fromCache: false, hasPendingWrites: false},
      docs: [queryDocument(first)],
    });
    expect(latestValues).toEqual([{kind: 'server_value', event: first}]);
  });

  it('reports synchronous window and latest listener registration failures as typed observations', () => {
    const onSnapshotMock = onSnapshot as jest.Mock;
    const onDecodeError = jest.fn();
    const store = remoteStore(onDecodeError);
    const windowValues: unknown[] = [];
    onSnapshotMock.mockImplementationOnce(() => {
      throw {code: 'firestore/permission-denied'};
    });

    const stopWindow = store.observeWindow(
      {...ids, from: 1_000},
      observation => windowValues.push(observation),
    );
    expect(windowValues).toEqual([
      {
        kind: 'error',
        error: expect.objectContaining({code: 'permission_denied'}),
      },
    ]);
    expect(stopWindow).not.toThrow();

    const latestValues: unknown[] = [];
    onSnapshotMock.mockImplementationOnce(() => {
      throw {code: 'firestore/unavailable'};
    });
    const stopLatest = store.observeLatest(
      {...ids, kind: 'diaper'},
      observation => latestValues.push(observation),
    );
    expect(latestValues).toEqual([
      {
        kind: 'error',
        error: expect.objectContaining({code: 'retryable'}),
      },
    ]);
    expect(stopLatest).not.toThrow();
    expect(onDecodeError).toHaveBeenCalledTimes(2);
  });

  it('uses the authoritative server document source for findById', async () => {
    const event = diaper();
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock.mockResolvedValue(
      documentSnapshot(event.id, encodeCareEventDocument(event)),
    );

    await expect(
      remoteStore().findById(ids.groupId, event.id),
    ).resolves.toEqual(event);
    expect(getDocFromServerMock).toHaveBeenCalledWith({
      path: `groups/${ids.groupId}/events/${event.id}`,
    });
  });

  it('preserves typed authorization errors from exact event reads', async () => {
    const event = diaper();
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock.mockRejectedValueOnce({
      code: 'firestore/permission-denied',
    });

    await expect(
      remoteStore().findById(ids.groupId, event.id),
    ).rejects.toMatchObject({remoteError: {code: 'permission_denied'}});
  });

  it('fetches a present active sleep through its exact singleton lock', async () => {
    const event = sleep('active-present');
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock
      .mockResolvedValueOnce(
        documentSnapshot(ids.babyId, activeSleepLock(event)),
      )
      .mockResolvedValueOnce(
        documentSnapshot(event.id, encodeCareEventDocument(event)),
      );

    await expect(remoteStore().fetchActiveSleep(ids)).resolves.toEqual(event);
    expect(
      getDocFromServerMock.mock.calls.map(([reference]) => reference.path),
    ).toEqual([
      `groups/${ids.groupId}/activeSleeps/${ids.babyId}`,
      `groups/${ids.groupId}/events/${event.id}`,
    ]);
  });

  it('returns none only when the server active-sleep lock is absent', async () => {
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock.mockResolvedValue(
      documentSnapshot(ids.babyId, undefined),
    );

    await expect(remoteStore().fetchActiveSleep(ids)).resolves.toBeUndefined();
    expect(getDocFromServerMock).toHaveBeenCalledTimes(1);
  });

  it('observes none only from a server-confirmed absent active-sleep lock', () => {
    const observations: unknown[] = [];
    const stop = remoteStore().observeActiveSleep(
      ids,
      observation => observations.push(observation),
    );
    const lockListener = observedSnapshotCall(
      `groups/${ids.groupId}/activeSleeps/${ids.babyId}`,
    );
    const nextLock = lockListener.call[2] as (snapshot: unknown) => void;

    nextLock(
      documentSnapshot(ids.babyId, undefined, {
        fromCache: true,
        hasPendingWrites: false,
      }),
    );
    expect(observations).toEqual([]);
    nextLock(documentSnapshot(ids.babyId, undefined));
    expect(observations).toEqual([
      {kind: 'server_value', event: undefined},
    ]);

    stop();
    expect(lockListener.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects every active-sleep lock identity mismatch', async () => {
    const event = sleep('active-mismatch');
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    const mismatchedEvents: readonly CareEvent[] = [
      {...event, groupId: groupId('other-group')},
      {...event, babyId: babyId('other-baby')},
      {...event, caregiverId: userId('other-user')},
      {...event, occurredAt: 1_500, startedAt: 1_500},
      {...event, createdAt: 2_500, updatedAt: 2_500},
    ];

    for (const mismatched of mismatchedEvents) {
      getDocFromServerMock
        .mockResolvedValueOnce(
          documentSnapshot(ids.babyId, activeSleepLock(event)),
        )
        .mockResolvedValueOnce(
          documentSnapshot(
            mismatched.id,
            encodeCareEventDocument(mismatched),
          ),
        );

      await expect(remoteStore().fetchActiveSleep(ids)).rejects.toMatchObject({
        remoteError: {code: 'invalid'},
      });
    }
  });

  it('rejects a missing active-sleep event instead of returning none', async () => {
    const event = sleep('active-missing');
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock
      .mockResolvedValueOnce(
        documentSnapshot(ids.babyId, activeSleepLock(event)),
      )
      .mockResolvedValueOnce(documentSnapshot(event.id, undefined));

    await expect(remoteStore().fetchActiveSleep(ids)).rejects.toMatchObject({
      remoteError: {code: 'invalid'},
    });
  });

  it('rejects an inactive event referenced by an active-sleep lock', async () => {
    const started = sleep('active-ended');
    const ended = {
      ...started,
      endedAt: 3_000,
      updatedAt: 3_000,
      revision: 2,
    } satisfies CareEvent;
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock
      .mockResolvedValueOnce(
        documentSnapshot(ids.babyId, activeSleepLock(started)),
      )
      .mockResolvedValueOnce(
        documentSnapshot(ended.id, encodeCareEventDocument(ended)),
      );

    await expect(remoteStore().fetchActiveSleep(ids)).rejects.toMatchObject({
      remoteError: {code: 'invalid'},
    });
  });

  it('rejects a soft-deleted event referenced by an active-sleep lock', async () => {
    const started = sleep('active-deleted');
    const deleted = {
      ...started,
      deletedAt: 3_000,
      updatedAt: 3_000,
      revision: 2,
    } satisfies CareEvent;
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock
      .mockResolvedValueOnce(
        documentSnapshot(ids.babyId, activeSleepLock(started)),
      )
      .mockResolvedValueOnce(
        documentSnapshot(deleted.id, encodeCareEventDocument(deleted)),
      );

    await expect(remoteStore().fetchActiveSleep(ids)).rejects.toMatchObject({
      remoteError: {code: 'invalid'},
    });
  });

  it('keeps active-sleep cache and pending snapshots out of server state', () => {
    const event = sleep('active-observed');
    const revised = {
      ...event,
      note: 'revision two',
      revision: 2,
      updatedAt: 2_500,
    } satisfies CareEvent;
    const observations: unknown[] = [];
    const stop = remoteStore().observeActiveSleep(ids, observation =>
      observations.push(observation),
    );
    const lockPath = `groups/${ids.groupId}/activeSleeps/${ids.babyId}`;
    const lockListener = observedSnapshotCall(lockPath);
    const nextLock = lockListener.call[2] as (snapshot: unknown) => void;

    nextLock(
      documentSnapshot(ids.babyId, activeSleepLock(event), {
        fromCache: true,
        hasPendingWrites: false,
      }),
    );
    nextLock(
      documentSnapshot(ids.babyId, activeSleepLock(event), {
        fromCache: false,
        hasPendingWrites: true,
      }),
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(observations).toEqual([]);

    nextLock(documentSnapshot(ids.babyId, activeSleepLock(event)));
    const eventPath = `groups/${ids.groupId}/events/${event.id}`;
    const eventListener = observedSnapshotCall(eventPath);
    const nextEvent = eventListener.call[2] as (snapshot: unknown) => void;
    nextEvent(
      documentSnapshot(event.id, encodeCareEventDocument(event), {
        fromCache: true,
        hasPendingWrites: false,
      }),
    );
    nextEvent(
      documentSnapshot(event.id, encodeCareEventDocument(event), {
        fromCache: false,
        hasPendingWrites: true,
      }),
    );
    expect(observations).toEqual([]);

    nextEvent(documentSnapshot(event.id, encodeCareEventDocument(event)));
    nextEvent(documentSnapshot(revised.id, encodeCareEventDocument(revised)));
    expect(observations).toEqual([
      {kind: 'server_value', event},
      {kind: 'server_value', event: revised},
    ]);

    stop();
    expect(lockListener.stop).toHaveBeenCalledTimes(1);
    expect(eventListener.stop).toHaveBeenCalledTimes(1);
  });

  it('switches active-sleep event listeners and blocks stale callbacks', () => {
    const first = sleep('active-first');
    const second = sleep('active-second');
    const observations: unknown[] = [];
    const stop = remoteStore().observeActiveSleep(ids, observation =>
      observations.push(observation),
    );
    const lockPath = `groups/${ids.groupId}/activeSleeps/${ids.babyId}`;
    const lockListener = observedSnapshotCall(lockPath);
    const nextLock = lockListener.call[2] as (snapshot: unknown) => void;

    nextLock(documentSnapshot(ids.babyId, activeSleepLock(first)));
    const firstListener = observedSnapshotCall(
      `groups/${ids.groupId}/events/${first.id}`,
    );
    const nextFirst = firstListener.call[2] as (snapshot: unknown) => void;

    nextLock(documentSnapshot(ids.babyId, activeSleepLock(second)));
    expect(firstListener.stop).toHaveBeenCalledTimes(1);
    const secondListener = observedSnapshotCall(
      `groups/${ids.groupId}/events/${second.id}`,
    );
    const nextSecond = secondListener.call[2] as (snapshot: unknown) => void;

    nextFirst(documentSnapshot(first.id, encodeCareEventDocument(first)));
    expect(observations).toEqual([]);
    nextSecond(documentSnapshot(second.id, encodeCareEventDocument(second)));
    expect(observations).toEqual([{kind: 'server_value', event: second}]);

    stop();
    expect(lockListener.stop).toHaveBeenCalledTimes(1);
    expect(secondListener.stop).toHaveBeenCalledTimes(1);
    nextLock(documentSnapshot(ids.babyId, undefined));
    nextSecond(documentSnapshot(second.id, encodeCareEventDocument(second)));
    expect(observations).toEqual([{kind: 'server_value', event: second}]);
  });

  it('reports typed active-sleep errors without synthesizing none', async () => {
    const getDocFromServerMock = getDocFromServer as jest.Mock;
    getDocFromServerMock.mockRejectedValueOnce({
      code: 'firestore/unavailable',
    });
    await expect(remoteStore().fetchActiveSleep(ids)).rejects.toMatchObject({
      remoteError: {code: 'retryable'},
    });

    const observations: unknown[] = [];
    remoteStore().observeActiveSleep(ids, observation =>
      observations.push(observation),
    );
    const lockListener = observedSnapshotCall(
      `groups/${ids.groupId}/activeSleeps/${ids.babyId}`,
    );
    const onError = lockListener.call[3] as (error: unknown) => void;
    onError({code: 'firestore/permission-denied'});

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      kind: 'error',
      error: {code: 'permission_denied'},
    });
    expect(observations).not.toContainEqual({
      kind: 'server_value',
      event: undefined,
    });
  });
});
