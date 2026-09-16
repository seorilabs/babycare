import type {BabyCareAnalyticsEvent} from '@babycare/product-core';

import {firebaseAnalyticsParams} from '../src/adapters/analytics/firebase-analytics-adapter';

describe('FirebaseAnalyticsAdapter', () => {
  it('adds canonical native dimensions and overrides caller spoofing', async () => {
    const event = {
      name: 'core_screen_view',
      params: {
        screen_name: 'stats',
        app_market: 'spoofed',
        runtime_platform: 'web',
        release_version: 'spoofed',
      },
    } as unknown as BabyCareAnalyticsEvent;

    expect(
      firebaseAnalyticsParams(event, {
        platform: 'ios',
        appVersion: '1.2.3',
      }),
    ).toEqual({
      screen_name: 'stats',
      app_market: 'app_store',
      runtime_platform: 'ios',
      release_version: '1.2.3',
    });
  });
});
