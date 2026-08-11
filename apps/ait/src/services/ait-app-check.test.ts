jest.mock('@apps-in-toss/framework', () => ({
  Storage: {},
  appLogin: jest.fn(),
}));

import {AitAppCheckProvider} from './ait-app-check';

function response(value: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 401,
    json: async () => value,
  } as Response;
}

function storage(initial?: unknown) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set('babynest.app-check-token.v1', JSON.stringify(initial));
  }
  return {
    values,
    port: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    },
  };
}

describe('AppsInToss App Check provider', () => {
  it('Toss 일회용 인가 코드를 서버에서 교환하고 유효한 token을 재사용한다', async () => {
    const now = 1_800_000_000_000;
    const store = storage();
    const login = jest.fn(async () => ({
      authorizationCode: 'one-time-code',
      referrer: 'SANDBOX' as const,
    }));
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        authorizationCode: 'one-time-code',
        referrer: 'SANDBOX',
      });
      return response({
        token: 'firebase-app-check-token',
        expireTimeMillis: now + 60 * 60 * 1_000,
      });
    });
    const provider = new AitAppCheckProvider({
      storage: store.port,
      login,
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => now,
    });

    await expect(
      Promise.all([provider.getToken(), provider.getToken()]),
    ).resolves.toEqual([
      'firebase-app-check-token',
      'firebase-app-check-token',
    ]);
    await expect(provider.getToken()).resolves.toBe('firebase-app-check-token');
    expect(login).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.port.setItem).toHaveBeenCalledTimes(1);
  });

  it('Storage의 유효한 token은 로그인 없이 복구한다', async () => {
    const now = 1_800_000_000_000;
    const store = storage({
      token: 'stored-app-check-token',
      expireTimeMillis: now + 30 * 60 * 1_000,
    });
    const login = jest.fn();
    const fetchImpl = jest.fn();
    const provider = new AitAppCheckProvider({
      storage: store.port,
      login,
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => now,
    });

    await expect(provider.getToken()).resolves.toBe('stored-app-check-token');
    expect(login).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('만료 임박 또는 손상된 token은 제거하고 다시 검증한다', async () => {
    const now = 1_800_000_000_000;
    const store = storage({
      token: 'expiring-token',
      expireTimeMillis: now + 60_000,
    });
    const provider = new AitAppCheckProvider({
      storage: store.port,
      login: jest.fn(async () => ({
        authorizationCode: 'fresh-code',
        referrer: 'DEFAULT' as const,
      })),
      fetch: jest.fn(async () =>
        response({
          token: 'fresh-token',
          expireTimeMillis: now + 60 * 60 * 1_000,
        }),
      ) as unknown as typeof fetch,
      now: () => now,
    });

    await expect(provider.getToken()).resolves.toBe('fresh-token');
    expect(store.values.get('babynest.app-check-token.v1')).toContain(
      'fresh-token',
    );
  });

  it('검증 실패 응답을 cache하지 않는다', async () => {
    const now = 1_800_000_000_000;
    const store = storage();
    const provider = new AitAppCheckProvider({
      storage: store.port,
      login: jest.fn(async () => ({
        authorizationCode: 'rejected-code',
        referrer: 'DEFAULT' as const,
      })),
      fetch: jest.fn(async () =>
        response(
          {error: {message: 'AppsInToss 로그인을 확인하지 못했어요.'}},
          false,
        ),
      ) as unknown as typeof fetch,
      now: () => now,
    });

    await expect(provider.getToken()).rejects.toThrow(
      'AppsInToss 로그인을 확인하지 못했어요.',
    );
    expect(store.port.setItem).not.toHaveBeenCalled();
  });
});
