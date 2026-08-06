const mockStored = new Map<string, string>();

jest.mock('@apps-in-toss/framework', () => ({
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

import {createCareGroup, recordQuickCareEvent} from './babycare-backend';

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
    const request = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/auth/firebase-custom-token')) {
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
        commits.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return response({commitTime: '2026-08-06T00:00:00Z'});
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

    expect(commits).toHaveLength(2);
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
  });
});
