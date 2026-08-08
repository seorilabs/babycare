import {Storage} from '@apps-in-toss/framework';

import {
  currentFirebaseIdToken,
  sendAnalyticsEventsToGa4,
} from './babycare-backend';
import {babycareAnalytics, createBabycareAnalytics} from './analytics';

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async () => undefined),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock('./babycare-backend', () => ({
  currentFirebaseIdToken: jest.fn(async () => 'firebase-token'),
  sendAnalyticsEventsToGa4: jest.fn(async () => undefined),
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

describe('AppsInToss analytics fan-out', () => {
  it('sends the same event to the authenticated GA4 relay and Platform Events', async () => {
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
      params: {screen_name: 'stats', screen_class: 'BabyNestHome'},
    });
    await analytics.flush();
    analytics.stop();
    babycareAnalytics.stop();

    expect(Storage.setItem).toHaveBeenCalledTimes(1);
    expect(sendAnalyticsEventsToGa4).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: expect.stringMatching(/^ait-/),
        events: [
          expect.objectContaining({
            name: 'core_screen_view',
            params: {
              screen_name: 'stats',
              screen_class: 'BabyNestHome',
            },
          }),
        ],
      }),
    );
    expect(currentFirebaseIdToken).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const platformRequest = fetchImpl.mock.calls[1];
    expect(platformRequest?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer platform-token',
      'X-Seori-App': 'babycare',
    });
    const body = JSON.parse(String(platformRequest?.[1]?.body));
    expect(body.events.map((event: {readonly name: string}) => event.name)).toEqual([
      'seori_session_start',
      'core_screen_view',
    ]);
    expect(body.context).toMatchObject({
      platform: 'ait',
      sdkVersion: 'babycare-analytics/1',
    });
  });
});
