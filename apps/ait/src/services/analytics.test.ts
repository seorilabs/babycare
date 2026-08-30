import {Storage} from '@apps-in-toss/framework';

import {
  currentFirebaseIdToken,
  sendAnalyticsEventsToGa4,
} from './babycare-backend';
import {
  AitGa4Analytics,
  babycareAnalytics,
  createBabycareAnalytics,
} from './analytics';

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
    await analytics.stop();
    await babycareAnalytics.stop();

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

describe('AitGa4Analytics buffering', () => {
  it('protects a retry batch and emits dropped count only after success', async () => {
    let release!: () => void;
    const firstRequest = new Promise<void>((_resolve, reject) => {
      release = () => reject(new Error('offline'));
    });
    const send = jest
      .fn()
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValue(undefined);
    const analytics = new AitGa4Analytics({
      send,
      clientId: async () => 'ait-test-client',
      now: () => 1_700_000_000_000,
    });

    for (let index = 0; index < 130; index += 1) {
      await analytics.track({
        name: 'core_screen_view',
        params: {screen_name: `screen-${index}`},
      });
    }
    const activeFlush = analytics.flush();
    release();
    await activeFlush;
    await analytics.flush();

    const retry = send.mock.calls[1]?.[0].events;
    expect(retry[0].params.screen_name).toBe('screen-0');
    expect(retry).not.toContainEqual(
      expect.objectContaining({name: 'seori_analytics_dropped'}),
    );
    await analytics.flush();
    const withDropped = send.mock.calls[2]?.[0].events;
    expect(withDropped).toContainEqual(
      expect.objectContaining({
        name: 'seori_analytics_dropped',
        params: {count: 30},
      }),
    );
    await analytics.flush();
    const afterReport = send.mock.calls[3]?.[0].events;
    expect(afterReport.some((event: {name: string}) => event.name === 'seori_analytics_dropped')).toBe(false);
  });

  it('flushes pending GA4 events before stop resolves', async () => {
    const send = jest.fn(async () => undefined);
    const analytics = new AitGa4Analytics({
      send,
      clientId: async () => 'ait-test-client',
    });
    await analytics.track({
      name: 'core_screen_view',
      params: {screen_name: 'background'},
    });
    await analytics.stop();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not reschedule a failed flush after stop', async () => {
    jest.useFakeTimers();
    try {
      const analytics = new AitGa4Analytics({
        send: jest.fn(async () => {
          throw new Error('offline');
        }),
        clientId: async () => 'ait-test-client',
      });
      await analytics.track({
        name: 'core_screen_view',
        params: {screen_name: 'background'},
      });

      await analytics.stop();

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
