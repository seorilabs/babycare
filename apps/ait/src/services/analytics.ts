import {Storage} from '@apps-in-toss/framework';
import {PlatformAnalytics} from '../../../../packages/product-data/src/analytics.ts';

import {currentFirebaseIdToken} from './babycare-backend';
import {AIT_APP_VERSION} from './release-version';

const PLATFORM_URL =
  'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_EVENTS_URL =
  'https://platform-ingest-306278488979.asia-northeast3.run.app';
const CLIENT_ID_KEY = 'babynest.analytics-client-id.v1';

function randomId(): string {
  return `ait-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}

let clientIdPromise: Promise<string> | undefined;

async function analyticsClientId(): Promise<string> {
  clientIdPromise ??= (async () => {
    const stored = await Storage.getItem(CLIENT_ID_KEY);
    if (stored && /^[A-Za-z0-9._-]{8,64}$/.test(stored)) {
      return stored;
    }
    const created = randomId();
    await Storage.setItem(CLIENT_ID_KEY, created);
    return created;
  })();
  return clientIdPromise;
}

export function createBabycareAnalytics(
  fetchImpl?: typeof fetch,
): PlatformAnalytics {
  return new PlatformAnalytics({
    baseUrl: PLATFORM_URL,
    eventsBaseUrl: PLATFORM_EVENTS_URL,
    firebaseIdToken: currentFirebaseIdToken,
    ga4ClientId: analyticsClientId,
    context: {
      platform: 'ait',
      appVersion: AIT_APP_VERSION,
      // Country derivation stays disabled until product analytics consent exists.
      analyticsConsent: false,
    },
    ...(fetchImpl ? {fetchImpl} : {}),
  });
}

export const babycareAnalytics = createBabycareAnalytics();
