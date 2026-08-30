import type {BabyCareAnalyticsEvent} from '@babycare/product-core';
import {FanOutAnalytics, PlatformAnalytics} from '@babycare/product-data';
import {flushMobileAnalyticsOnAppState} from '../src/app/analytics-lifecycle';

describe('analytics lifecycle', () => {
  it('flushes every fan-out sink before stopping them', async () => {
    const order: string[] = [];
    const sink = (name: string) => ({
      track: jest.fn(async () => undefined),
      flush: jest.fn(async () => {
        order.push(`flush-${name}`);
      }),
      stop: jest.fn(async () => {
        order.push(`stop-${name}`);
      }),
    });
    const analytics = new FanOutAnalytics([sink('ga4'), sink('platform')]);

    await analytics.stop();
    expect(order.slice(0, 2)).toEqual(['flush-ga4', 'flush-platform']);
    expect(order.slice(2).sort()).toEqual(['stop-ga4', 'stop-platform']);
  });

  it('flushes once on mobile background and swallows a sink failure', async () => {
    const flush = jest.fn(async () => {
      throw new Error('offline');
    });
    const analytics = {track: jest.fn(async () => undefined), flush};

    expect(() =>
      flushMobileAnalyticsOnAppState(analytics, 'background'),
    ).not.toThrow();
    await Promise.resolve();
    flushMobileAnalyticsOnAppState(analytics, 'active');
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

function response(input: {
  readonly ok: boolean;
  readonly status: number;
  readonly body?: unknown;
}): Response {
  return {
    ok: input.ok,
    status: input.status,
    json: async () => input.body,
  } as Response;
}

describe('PlatformAnalytics', () => {
  it('Firebase 세션으로 핵심 이벤트를 전송하고 PII 키를 제거한다', async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/v1/auth/session')) {
        return response({
          ok: true,
          status: 200,
          body: {
            ok: true,
            result: {platformToken: 'platform-token', expiresIn: 3600},
          },
        });
      }
      return response({ok: true, status: 200});
    }) as jest.MockedFunction<typeof fetch>;
    const analytics = new PlatformAnalytics({
      baseUrl: 'https://platform.example.com/',
      eventsBaseUrl: 'https://platform-ingest.example.com/',
      context: {platform: 'android', appVersion: '1.0.0'},
      firebaseIdToken: async () => 'firebase-token',
      fetchImpl,
      flushIntervalMs: 0,
      now: () => 1_700_000_000_000,
    });

    const untrustedEvent = {
      name: 'core_ad_reward',
      params: {
        placement: 'stats_detail',
        ad_format: 'rewarded',
        reward_code: 'stats_detail_24h',
        reward_amount: 1,
        email: 'blocked@example.com',
      },
    } as unknown as BabyCareAnalyticsEvent;
    await analytics.track(untrustedEvent);
    await analytics.flush();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const sessionRequest = fetchImpl.mock.calls[0];
    expect(sessionRequest?.[0]).toBe(
      'https://platform.example.com/v1/auth/session',
    );
    expect(JSON.parse(String(sessionRequest?.[1]?.body))).toEqual({
      credential: {kind: 'firebase-id-token', value: 'firebase-token'},
    });

    const eventRequest = fetchImpl.mock.calls[1];
    expect(eventRequest?.[0]).toBe(
      'https://platform-ingest.example.com/v1/events',
    );
    expect(eventRequest?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer platform-token',
      'X-Seori-App': 'babycare',
    });
    const body = JSON.parse(String(eventRequest?.[1]?.body));
    expect(body.context).toEqual({
      platform: 'android',
      appVersion: '1.0.0',
      sdkVersion: 'babycare-analytics/1',
    });
    expect(body.events).toHaveLength(2);
    expect(body.events[0]).toMatchObject({
      name: 'seori_session_start',
      tsUnixMs: 1_700_000_000_000,
    });
    expect(body.events[0].eventId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.events[1]).toMatchObject({
      name: 'core_ad_reward',
      params: {
        placement: 'stats_detail',
        ad_format: 'rewarded',
        reward_code: 'stats_detail_24h',
        reward_amount: 1,
      },
    });
    expect(body.events[1].params).not.toHaveProperty('email');
  });

  it('전송 실패 배치를 같은 eventId로 재시도한다', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ok: false, status: 503}))
      .mockResolvedValueOnce(response({ok: true, status: 200})) as jest.MockedFunction<
      typeof fetch
    >;
    const analytics = new PlatformAnalytics({
      baseUrl: 'https://platform.example.com',
      context: {platform: 'ait'},
      fetchImpl,
      flushIntervalMs: 0,
      now: () => 1_700_000_000_000,
    });

    await analytics.flush();
    await analytics.flush();

    const first = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const second = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(second.events).toEqual(first.events);
  });

  it('protects a failed retry batch while 20 new events arrive', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ok: false, status: 503}))
      .mockResolvedValue(response({ok: true, status: 200})) as jest.MockedFunction<
      typeof fetch
    >;
    const analytics = new PlatformAnalytics({
      baseUrl: 'https://platform.example.com',
      context: {platform: 'ait'},
      fetchImpl,
      flushIntervalMs: 0,
      now: () => 1_700_000_000_000,
    });

    await analytics.flush();
    const failed = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).events[0];
    for (let index = 0; index < 20; index += 1) {
      await analytics.track({
        name: 'core_screen_view',
        params: {screen_name: `new-${index}`},
      });
    }
    await analytics.flush();

    const retried = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)).events;
    expect(retried).toContainEqual(failed);
  });

  it('drops the oldest unprotected events and reports the count once', async () => {
    let release!: () => void;
    const firstRequest = new Promise<Response>(resolve => {
      release = () => resolve(response({ok: true, status: 200}));
    });
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValue(response({ok: true, status: 200})) as jest.MockedFunction<
      typeof fetch
    >;
    const analytics = new PlatformAnalytics({
      baseUrl: 'https://platform.example.com',
      context: {platform: 'android'},
      fetchImpl,
      flushIntervalMs: 0,
      now: () => 1_700_000_000_000,
    });

    for (let index = 0; index < 229; index += 1) {
      await analytics.track({
        name: 'core_screen_view',
        params: {screen_name: `screen-${index}`},
      });
    }
    const activeFlush = analytics.flush();
    release();
    await activeFlush;
    await analytics.flush();
    const reported = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)).events;
    expect(reported).toContainEqual(
      expect.objectContaining({
        name: 'seori_analytics_dropped',
        params: {count: 10},
      }),
    );
    expect(reported[0].params.screen_name).toBe('screen-29');

    await analytics.flush();
    const next = JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body)).events;
    expect(next.some((event: {name: string}) => event.name === 'seori_analytics_dropped')).toBe(false);
  });

  it('flushes buffered events before stop resolves', async () => {
    const fetchImpl = jest.fn(async () => response({ok: true, status: 200})) as unknown as jest.MockedFunction<
      typeof fetch
    >;
    const analytics = new PlatformAnalytics({
      baseUrl: 'https://platform.example.com',
      context: {platform: 'ios'},
      fetchImpl,
      flushIntervalMs: 0,
    });
    await analytics.track({
      name: 'core_screen_view',
      params: {screen_name: 'background'},
    });

    await analytics.stop();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).events).toHaveLength(2);
  });
});
