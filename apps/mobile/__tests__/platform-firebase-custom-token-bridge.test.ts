import {
  PlatformAuthBridgeError,
  PlatformFirebaseCustomTokenBridge,
} from '../src/adapters/platform/platform-firebase-custom-token-bridge';

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

describe('PlatformFirebaseCustomTokenBridge', () => {
  it('sends the legacy ID token and decodes a custom token response', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, {
        ok: true,
        result: {
          firebaseCustomToken: 'custom-token',
          appUserId: 'legacy-user',
        },
      }),
    );
    const bridge = new PlatformFirebaseCustomTokenBridge({
      baseUrl: 'https://platform.test/',
      appId: 'babycare',
      fetch: fetchMock as unknown as typeof fetch,
      appCheckToken: async () => 'app-check-token',
      debugBuild: false,
    });

    await expect(
      bridge.createFirebaseCustomToken({
        existingFirebaseIdToken: 'legacy-id-token',
      }),
    ).resolves.toEqual({
      firebaseCustomToken: 'custom-token',
      appUserId: 'legacy-user',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://platform.test/v1/auth/firebase-custom-token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Seori-App': 'babycare',
          'X-Firebase-AppCheck': 'app-check-token',
        },
        body: JSON.stringify({
          appId: 'babycare',
          existingFirebaseIdToken: 'legacy-id-token',
        }),
      }),
    );
  });

  it('omits the legacy token for a new account-free user', async () => {
    const fetchMock = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, {
          ok: true,
          result: { firebaseCustomToken: 'custom-token', appUserId: 'pb-new' },
        }),
    );
    const bridge = new PlatformFirebaseCustomTokenBridge({
      baseUrl: 'https://platform.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await bridge.createFirebaseCustomToken({});

    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      appId: 'babycare',
    });
  });

  it('continues without an App Check header when token issuance is unavailable', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, {
        ok: true,
        result: {firebaseCustomToken: 'custom-token', appUserId: 'pb-new'},
      }),
    );
    const bridge = new PlatformFirebaseCustomTokenBridge({
      baseUrl: 'https://platform.test',
      fetch: fetchMock as unknown as typeof fetch,
      appCheckToken: async () => {
        throw new Error('App attestation failed');
      },
      debugBuild: false,
    });

    await expect(bridge.createFirebaseCustomToken({})).resolves.toEqual({
      firebaseCustomToken: 'custom-token',
      appUserId: 'pb-new',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://platform.test/v1/auth/firebase-custom-token',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-Seori-App': 'babycare',
        },
      }),
    );
  });

  it('deletes the verified Firebase account mapping with App Check', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, {ok: true, result: {deleted: true}}),
    );
    const bridge = new PlatformFirebaseCustomTokenBridge({
      baseUrl: 'https://platform.test/',
      appId: 'babycare',
      fetch: fetchMock as unknown as typeof fetch,
      appCheckToken: async () => 'app-check-token',
      debugBuild: false,
    });

    await expect(
      bridge.deleteFirebaseAccount({firebaseIdToken: 'firebase-id-token'}),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://platform.test/v1/auth/firebase-account',
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Seori-App': 'babycare',
          'X-Firebase-AppCheck': 'app-check-token',
        },
        body: JSON.stringify({
          appId: 'babycare',
          firebaseIdToken: 'firebase-id-token',
        }),
      },
    );
  });

  it('surfaces platform error codes without exposing malformed payloads', async () => {
    const denied = new PlatformFirebaseCustomTokenBridge({
      fetch: jest.fn(async () =>
        response(403, {
          ok: false,
          error: { code: 'auth_forbidden', message: '허용되지 않았어요' },
        }),
      ) as unknown as typeof fetch,
    });

    await expect(denied.createFirebaseCustomToken({})).rejects.toEqual(
      expect.objectContaining<Partial<PlatformAuthBridgeError>>({
        code: 'auth_forbidden',
        status: 403,
      }),
    );

    const malformed = new PlatformFirebaseCustomTokenBridge({
      fetch: jest.fn(async () =>
        response(200, { ok: true, result: {} }),
      ) as unknown as typeof fetch,
    });
    await expect(malformed.createFirebaseCustomToken({})).rejects.toMatchObject(
      {
        code: 'platform_response_invalid',
      },
    );
  });

  describe('개발용 빌드 표시', () => {
    const devGlobal = globalThis as typeof globalThis & {__DEV__?: boolean};
    const originalDev = devGlobal.__DEV__;

    afterEach(() => {
      devGlobal.__DEV__ = originalDev;
    });

    async function platformRequestHeaders(options: {
      readonly debugBuild?: boolean;
    }): Promise<Record<string, string>[]> {
      const fetchMock = jest.fn(
        async (input: RequestInfo | URL, _init?: RequestInit) =>
          String(input).endsWith('/v1/auth/firebase-account')
            ? response(200, {ok: true, result: {deleted: true}})
            : response(200, {
                ok: true,
                result: {firebaseCustomToken: 'custom-token', appUserId: 'pb-new'},
              }),
      );
      const bridge = new PlatformFirebaseCustomTokenBridge({
        baseUrl: 'https://platform.test',
        fetch: fetchMock as unknown as typeof fetch,
        ...options,
      });

      await bridge.createFirebaseCustomToken({});
      await bridge.deleteFirebaseAccount({firebaseIdToken: 'firebase-id-token'});

      expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
        'https://platform.test/v1/auth/firebase-custom-token',
        'https://platform.test/v1/auth/firebase-account',
      ]);
      return fetchMock.mock.calls.map(
        ([, init]) => init?.headers as Record<string, string>,
      );
    }

    it('개발용 빌드는 계정 발급과 삭제 요청에 X-Seori-Build: debug를 붙인다', async () => {
      const headers = await platformRequestHeaders({debugBuild: true});

      for (const header of headers) {
        expect(header).toMatchObject({'X-Seori-Build': 'debug'});
      }
    });

    it('마켓 출시 빌드는 X-Seori-Build를 보내지 않는다', async () => {
      const headers = await platformRequestHeaders({debugBuild: false});

      for (const header of headers) {
        expect(header).not.toHaveProperty('X-Seori-Build');
      }
    });

    it.each([
      [true, 'debug'],
      [false, undefined],
    ])('debugBuild를 생략하면 __DEV__=%s를 따른다', async (dev, expected) => {
      devGlobal.__DEV__ = dev;

      const headers = await platformRequestHeaders({});

      for (const header of headers) {
        expect(header['X-Seori-Build']).toBe(expected);
      }
    });
  });
});
