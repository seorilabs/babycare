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

  it('deletes the verified Firebase account mapping with App Check', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, {ok: true, result: {deleted: true}}),
    );
    const bridge = new PlatformFirebaseCustomTokenBridge({
      baseUrl: 'https://platform.test/',
      appId: 'babycare',
      fetch: fetchMock as unknown as typeof fetch,
      appCheckToken: async () => 'app-check-token',
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
});
