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

import {
  createCareGroup,
  createInviteCode,
  recordQuickCareEvent,
} from './babycare-backend';

function response(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  } as Response;
}

describe('AppsInToss BabyCare backend', () => {
  beforeEach(() => {
    mockStored.clear();
  });

  it('commits canonical Firestore resource names for groups and care events', async () => {
    const commits: Record<string, unknown>[] = [];
    const protectedRequests: {url: string; headers: Record<string, string>}[] = [];
    const request = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/mintAitAppCheckToken')) {
        return response({
          token: 'app-check-token',
          expireTimeMillis: Date.now() + 60 * 60 * 1_000,
        });
      }
      if (url.includes('/v1/auth/firebase-custom-token')) {
        protectedRequests.push({
          url,
          headers: init?.headers as Record<string, string>,
        });
        return response({
          ok: true,
          result: {firebaseCustomToken: 'custom-token', appUserId: 'user-1'},
        });
      }
      if (url.includes('accounts:signInWithCustomToken')) {
        return response({
          idToken: 'id-token-1',
          refreshToken: 'refresh-token-1',
          localId: 'user-1',
        });
      }
      if (url.includes('securetoken.googleapis.com')) {
        return response({
          id_token: 'id-token-2',
          refresh_token: 'refresh-token-2',
          user_id: 'user-1',
        });
      }
      if (url.endsWith('documents:commit')) {
        protectedRequests.push({
          url,
          headers: init?.headers as Record<string, string>,
        });
        commits.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return response({commitTime: '2026-08-06T00:00:00Z'});
      }
      if (url.endsWith('/createInvite')) {
        protectedRequests.push({
          url,
          headers: init?.headers as Record<string, string>,
        });
        return response({result: {code: 'ABC234'}});
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    global.fetch = request as unknown as typeof fetch;

    const ready = await createCareGroup({
      caregiverName: '엄마',
      babyName: '지안',
      birthDate: '2026-08-01',
    });
    await recordQuickCareEvent(ready, 'feeding');
    await recordQuickCareEvent(ready, {
      kind: 'temperature',
      temperatureCelsius: 38.2,
      measurementSite: 'ear',
    });
    await recordQuickCareEvent(ready, {
      kind: 'medication',
      medicationName: '아세트아미노펜',
      medicationCategory: 'antipyretic',
      activeIngredient: 'acetaminophen',
      doseAmount: 3.5,
      doseUnit: 'ml',
      minimumIntervalMinutes: 240,
    });
    await expect(createInviteCode(ready)).resolves.toBe('ABC234');

    expect(commits).toHaveLength(4);
    const writes = commits.flatMap(commit => commit.writes as Record<string, unknown>[]);
    const names = writes
      .map(write => {
        const update = write.update as {name?: string} | undefined;
        return update?.name;
      })
      .filter((name): name is string => Boolean(name));
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names.every(name => name.startsWith('projects/seorilabs-babycare/'))).toBe(true);
    expect(names.every(name => !name.startsWith('https://'))).toBe(true);
    expect(names.some(name => name.includes('/events/'))).toBe(true);
    expect(names.some(name => name.includes('/eventMutationReceipts/'))).toBe(true);
    expect(JSON.stringify(commits)).toContain('temperatureCelsius');
    expect(JSON.stringify(commits)).toContain('minimumIntervalMinutes');
    expect(protectedRequests.length).toBeGreaterThan(0);
    expect(
      protectedRequests.every(
        request => request.headers['X-Firebase-AppCheck'] === 'app-check-token',
      ),
    ).toBe(true);
  });
});
