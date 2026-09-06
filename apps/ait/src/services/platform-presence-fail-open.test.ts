import {Presence, SDK_VERSION} from '@seorilabs/platform-sdk';

const context = {platform: 'ait' as const, appVersion: '1.0.0'};
const bootstrap = {
  enabled: true,
  token: 'ephemeral-token',
  edgeUrl: 'https://presence.invalid',
  expiresIn: 300,
  heartbeatIntervalSeconds: 60,
};

it('SDK 0.5.0 disabled Presence opens no token or edge request', async () => {
  expect(SDK_VERSION).toBe('0.5.0');
  const tokenRequest = jest.fn();
  const fetchImpl = jest.fn(async () => new Response(null, {status: 204}));
  const presence = new Presence({
    enabled: false,
    context,
    tokenTransport: {
      async request<T>() {
        tokenRequest();
        return bootstrap as T;
      },
    },
    fetchImpl,
  });

  presence.start();
  presence.resume();
  await Promise.resolve();
  presence.stop();
  expect(tokenRequest).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it.each([
  ['503', async () => new Response(null, {status: 503})],
  ['DNS', async () => Promise.reject(new TypeError('fetch failed'))],
  ['TLS', async () => Promise.reject(new TypeError('certificate failed'))],
])('swallows %s edge failures without blocking product work', async (_name, fetchImpl) => {
  let productActions = 0;
  const presence = new Presence({
    enabled: true,
    context,
    tokenTransport: {
      async request<T>() {
        return bootstrap as T;
      },
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(() => presence.start()).not.toThrow();
  productActions += 1;
  await Promise.resolve();
  productActions += 1;
  expect(productActions).toBe(2);
  presence.stop();
});

it('aborts a stalled edge heartbeat after the SDK default two seconds', async () => {
  jest.useFakeTimers();
  let signal: RequestInit['signal'];
  const fetchImpl = jest.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
  );
  const presence = new Presence({
    enabled: true,
    context,
    tokenTransport: {
      async request<T>() {
        return bootstrap as T;
      },
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  try {
    expect(() => presence.start()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1_999);
    expect(signal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(signal?.aborted).toBe(true);
  } finally {
    presence.stop();
    jest.useRealTimers();
  }
});
