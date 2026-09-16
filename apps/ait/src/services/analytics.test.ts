import {Storage} from '@apps-in-toss/framework';

import {currentFirebaseIdToken} from './babycare-backend';
import {babycareAnalytics, createBabycareAnalytics} from './analytics';

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async () => undefined),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock('./babycare-backend', () => ({
  currentFirebaseIdToken: jest.fn(async () => 'firebase-token'),
}));

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

describe('AppsInToss Platform analytics relay', () => {
  it('uses only Platform Events and attaches stable GA4 and canonical context', async () => {
    const fetchImpl = jest.fn(
      async (url: string | URL | Request, _init?: RequestInit) => {
        void _init;
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
      },
    );
    const analytics = createBabycareAnalytics(fetchImpl as typeof fetch);

    await analytics.track({
      name: 'core_screen_view',
      params: {
        screen_name: 'stats',
        screen_class: 'BabyNestHome',
        app_market: 'spoofed',
      },
    } as never);
    await analytics.flush();
    await analytics.stop();
    await babycareAnalytics.stop();

    expect(Storage.setItem).toHaveBeenCalledTimes(1);
    expect(currentFirebaseIdToken).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const platformRequest = fetchImpl.mock.calls[1];
    expect(platformRequest?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer platform-token',
      'X-Seori-App': 'babycare',
    });
    const body = JSON.parse(String(platformRequest?.[1]?.body));
    expect(body.context).toMatchObject({
      platform: 'ait',
      appVersion: expect.any(String),
      analyticsConsent: false,
      ga4ClientId: expect.stringMatching(/^ait-/),
      sdkVersion: 'babycare-analytics/1',
    });
    expect(body.events.map((event: {readonly name: string}) => event.name)).toEqual([
      'seori_session_start',
      'core_screen_view',
    ]);
    expect(body.events[0].sessionId).toBe(body.events[1].sessionId);
    expect(body.events[1].params).toMatchObject({
      screen_name: 'stats',
      screen_class: 'BabyNestHome',
      app_market: 'apps_in_toss',
      runtime_platform: 'web',
      release_version: expect.any(String),
      session_id: body.events[1].sessionId,
      engagement_time_msec: expect.any(Number),
    });
    expect(body.events[1].params.engagement_time_msec).toBeGreaterThanOrEqual(1);
  });
});
