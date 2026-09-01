const mockStored = new Map<string, string>();

jest.mock('@apps-in-toss/framework', () => ({
  appLogin: jest.fn(async () => ({
    authorizationCode: 'one-time-code',
    referrer: 'SANDBOX',
  })),
  Storage: {
    getItem: jest.fn(async (key: string) => mockStored.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStored.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStored.delete(key);
    }),
  },
}));

import {bootstrapCareSession} from './babycare-backend';
import {
  babyId,
  groupId,
  userId,
} from '../../../../packages/product-core/src/index.ts';
import {careEventSyncStorageKey} from '../../../../packages/product-data/src/index.ts';

const SESSION_KEY = 'babynest.firebase-session.v1';
const DOCUMENT_ROOT =
  'projects/seorilabs-babycare/databases/(default)/documents';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/${DOCUMENT_ROOT}`;
const SYNC_KEY = '@babycare/care-event-sync/v1/user-1/group-a/baby-a';
const OTHER_SYNC_KEY = '@babycare/care-event-sync/v1/user-2/group-b/baby-b';

function response(
  value: unknown,
  options: {readonly ok?: boolean; readonly status?: number} = {},
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => value,
  } as Response;
}

function toFirestoreValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return {stringValue: value};
  }
  if (typeof value === 'number') {
    return {integerValue: String(value)};
  }
  if (Array.isArray(value)) {
    return {arrayValue: {values: value.map(toFirestoreValue)}};
  }
  throw new Error('테스트 fixture로 지원하지 않는 값이에요.');
}

function firestoreDocument(
  path: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: `${DOCUMENT_ROOT}/${path}`,
    fields: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
    ),
  };
}

const NOW = 1_756_000_000_000;

const groupDocument = firestoreDocument('groups/group-a', {
  id: 'group-a',
  name: '지안',
  ownerId: 'owner-1',
  babyIds: ['baby-a'],
  createdAt: NOW,
  updatedAt: NOW,
});
const membershipDocument = firestoreDocument('groups/group-a/members/user-1', {
  userId: 'user-1',
  groupId: 'group-a',
  caregiverRole: 'parent',
  membershipRole: 'member',
  displayName: '아빠',
  color: '#5FB49C',
  joinedAt: NOW,
});
const babyDocument = firestoreDocument('groups/group-a/babies/baby-a', {
  id: 'baby-a',
  groupId: 'group-a',
  name: '지안',
  birthDate: '2026-08-01',
  sex: 'female',
  createdAt: NOW,
  updatedAt: NOW,
});

interface RouteOptions {
  readonly groupResponse: () => Response;
  readonly runQueryRows?: readonly Record<string, unknown>[];
}

function installFetch(options: RouteOptions): jest.Mock {
  const request = jest.fn(async (url: string) => {
    if (url.includes('/mintAitAppCheckToken')) {
      return response({
        token: 'app-check-token',
        expireTimeMillis: Date.now() + 60 * 60 * 1_000,
      });
    }
    if (url.includes('securetoken.googleapis.com')) {
      return response({
        id_token: 'id-token-1',
        refresh_token: 'refresh-token-1',
        user_id: 'user-1',
      });
    }
    if (url.endsWith('documents:runQuery')) {
      return response(
        (options.runQueryRows ?? []).map(document => ({document})),
      );
    }
    if (url === `${FIRESTORE_URL}/groups/group-a`) {
      return options.groupResponse();
    }
    if (url === `${FIRESTORE_URL}/groups/group-a/members/user-1`) {
      return response(membershipDocument);
    }
    if (url === `${FIRESTORE_URL}/groups/group-a/babies/baby-a`) {
      return response(babyDocument);
    }
    if (url.startsWith(`${FIRESTORE_URL}/groups/group-a/members?`)) {
      return response({documents: [membershipDocument]});
    }
    if (url.startsWith(`${FIRESTORE_URL}/groups/group-a/events?`)) {
      return response({documents: []});
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  global.fetch = request as unknown as typeof fetch;
  return request;
}

function seedSession(session: Record<string, unknown>): void {
  mockStored.set(SESSION_KEY, JSON.stringify(session));
}

function storedSession(): Record<string, unknown> {
  const raw = mockStored.get(SESSION_KEY);
  if (!raw) {
    throw new Error('저장된 세션이 없어요.');
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('AppsInToss 세션 복원의 그룹 접근 상실 처리', () => {
  beforeEach(() => {
    mockStored.clear();
    seedSession({
      refreshToken: 'refresh-token-0',
      uid: 'user-1',
      groupId: 'group-a',
      babyId: 'baby-a',
    });
    mockStored.set(SYNC_KEY, '{"cached":"care-events"}');
    mockStored.set(OTHER_SYNC_KEY, '{"cached":"other-scope"}');
  });

  it.each([403, 404])(
    '그룹 조회 %i와 멤버십 소멸이 확인되면 온보딩으로 내려가고 세션 캐시를 지운다',
    async status => {
      installFetch({
        groupResponse: () =>
          response({error: {message: 'no access'}}, {ok: false, status}),
        runQueryRows: [],
      });

      await expect(bootstrapCareSession()).resolves.toBeUndefined();

      const session = storedSession();
      expect(session.groupId).toBeUndefined();
      expect(session.babyId).toBeUndefined();
      expect(session.uid).toBe('user-1');
    },
  );

  it('구현이 쓰는 저장 키 헬퍼는 인수조건의 저장 키 형식과 일치한다', () => {
    expect(
      careEventSyncStorageKey({
        userId: userId('user-1'),
        groupId: groupId('group-a'),
        babyId: babyId('baby-a'),
      }),
    ).toBe(SYNC_KEY);
  });

  it('접근 상실이 확정되면 해당 scope의 로컬 돌봄 기록만 purge한다', async () => {
    installFetch({
      groupResponse: () =>
        response({error: {message: 'permission denied'}}, {ok: false, status: 403}),
      runQueryRows: [],
    });

    await expect(bootstrapCareSession()).resolves.toBeUndefined();

    expect(mockStored.has(SYNC_KEY)).toBe(false);
    expect(mockStored.get(OTHER_SYNC_KEY)).toBe('{"cached":"other-scope"}');
  });

  it('일시 오류에서는 부팅 실패를 유지하고 세션과 로컬 기록을 보존한다', async () => {
    const request = installFetch({
      groupResponse: () =>
        response({error: {message: 'unavailable'}}, {ok: false, status: 503}),
    });

    await expect(bootstrapCareSession()).rejects.toThrow('unavailable');

    expect(storedSession().groupId).toBe('group-a');
    expect(storedSession().babyId).toBe('baby-a');
    expect(mockStored.get(SYNC_KEY)).toBe('{"cached":"care-events"}');
    expect(
      request.mock.calls.some(([url]) =>
        String(url).endsWith('documents:runQuery'),
      ),
    ).toBe(false);
  });

  it('멤버십 재판정이 일시 오류로 실패하면 purge 없이 부팅 실패로 되돌린다', async () => {
    const request = jest.fn(async (url: string) => {
      if (url.includes('/mintAitAppCheckToken')) {
        return response({
          token: 'app-check-token',
          expireTimeMillis: Date.now() + 60 * 60 * 1_000,
        });
      }
      if (url.includes('securetoken.googleapis.com')) {
        return response({
          id_token: 'id-token-1',
          refresh_token: 'refresh-token-1',
          user_id: 'user-1',
        });
      }
      if (url === `${FIRESTORE_URL}/groups/group-a`) {
        return response(
          {error: {message: 'permission denied'}},
          {ok: false, status: 403},
        );
      }
      if (url.endsWith('documents:runQuery')) {
        return response({error: {message: 'unavailable'}}, {ok: false, status: 503});
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    global.fetch = request as unknown as typeof fetch;

    await expect(bootstrapCareSession()).rejects.toThrow('unavailable');

    expect(storedSession().groupId).toBe('group-a');
    expect(mockStored.get(SYNC_KEY)).toBe('{"cached":"care-events"}');
  });

  it('멤버십이 정상인 기존 사용자의 부팅 경로는 그대로 성공한다', async () => {
    const request = installFetch({
      groupResponse: () => response(groupDocument),
    });

    const ready = await bootstrapCareSession();

    expect(ready?.group.id).toBe('group-a');
    expect(ready?.baby.id).toBe('baby-a');
    expect(ready?.membership.userId).toBe('user-1');
    expect(storedSession().groupId).toBe('group-a');
    expect(storedSession().babyId).toBe('baby-a');
    expect(mockStored.get(SYNC_KEY)).toBe('{"cached":"care-events"}');
    expect(
      request.mock.calls.some(([url]) =>
        String(url).endsWith('documents:runQuery'),
      ),
    ).toBe(false);
  });
});
