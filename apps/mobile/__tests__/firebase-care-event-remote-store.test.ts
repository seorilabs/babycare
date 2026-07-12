import {
  onSnapshot,
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
  doc: (parent: unknown, ...segments: string[]) => ({
    path: mockReferencePath(parent, segments),
  }),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(value => value),
  onSnapshot: jest.fn(() => jest.fn()),
  orderBy: jest.fn(value => value),
  query: jest.fn(value => value),
  runTransaction: jest.fn(async (_firestore, callback) =>
    callback(mockTransaction),
  ),
  serverTimestamp: jest.fn(() => ({__serverTimestamp: true})),
  where: jest.fn(value => value),
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

function remoteStore() {
  return new FirebaseCareEventRemoteStore(
    {} as never,
    ids.caregiverId,
    jest.fn(),
  );
}

describe('Firebase care event remote transaction', () => {
  beforeEach(() => {
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
