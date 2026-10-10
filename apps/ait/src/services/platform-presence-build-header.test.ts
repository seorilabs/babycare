// 실제 Platform SDK로 Presence 조합 지점을 불러와 세션 교환 요청이 Granite 번들의 __DEV__에
// 따라 X-Seori-Build를 붙이는지 확인한다. 출시용 `ait build`는 `granite build`를 dev=false로
// 돌려 __DEV__를 false로 고정한다. 조합 지점은 debugBuild를 넘기지 않으므로 SDK 기본값이
// 그대로 쓰여야 한다.
jest.mock('./babycare-backend', () => ({
  currentFirebaseIdToken: jest.fn(async () => 'firebase-token'),
}));
jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

const SESSION = {
  platformToken: 'platform-token',
  refreshToken: 'refresh-token',
  platformUserId: 'platform-user',
  supportCode: 'SUPPORT',
  appUserId: 'app-user',
  isAnonymous: false,
  expiresIn: 3600,
};

describe('AppsInToss Presence Platform SDK 개발용 빌드 표시', () => {
  const runtime = globalThis as typeof globalThis & {__DEV__?: boolean};
  const originalDev = runtime.__DEV__;
  const originalFetch = runtime.fetch;

  afterEach(() => {
    runtime.__DEV__ = originalDev;
    runtime.fetch = originalFetch;
  });

  // SDK client는 모듈 로드 시 생성되므로 __DEV__를 바꾼 뒤 격리된 registry에서 다시 불러온다.
  // 조합 지점 전체를 처음 변환하면 기본 5초를 넘길 수 있어 시간 한도를 넉넉히 둔다.
  it.each([
    [true, 'debug'],
    [false, undefined],
  ])('__DEV__=%s 빌드의 세션 교환 X-Seori-Build는 %s', async (dev, expected) => {
    runtime.__DEV__ = dev;
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit?]>(
      async () => ({
        ok: true,
        status: 200,
        headers: {get: () => null},
        text: async () => JSON.stringify({ok: true, result: SESSION}),
      }),
    );
    runtime.fetch = fetchMock as unknown as typeof fetch;

    let isolated: typeof import('./platform-presence') | undefined;
    jest.isolateModules(() => {
      isolated =
        jest.requireActual<typeof import('./platform-presence')>(
          './platform-presence',
        );
    });
    await isolated?.aitPresencePlatform.signIn({
      kind: 'firebase-id-token',
      value: 'firebase-token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(url).pathname).toBe('/v1/auth/session');
    expect(
      (init?.headers as Record<string, string>)['X-Seori-Build'],
    ).toBe(expected);
  }, 60_000);
});
