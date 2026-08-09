import type {BabyCareAnalyticsEvent} from '@babycare/product-core';
import {PlatformAnalytics} from '@babycare/product-data';

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
});
