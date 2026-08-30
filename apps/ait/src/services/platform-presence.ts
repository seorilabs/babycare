import {createPlatform} from '@seorilabs/platform-sdk';
import type {AppStateStatus} from 'react-native';

import {currentFirebaseIdToken} from './babycare-backend';

const PLATFORM_API_URL =
  'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL =
  'https://platform-ingest-306278488979.asia-northeast3.run.app';
const APP_VERSION = process.env.APP_VERSION ?? '0.1.0';

export const BABYCARE_AIT_PRESENCE_ENABLED = false;

const aitPresencePlatform = createPlatform({
  appId: 'babycare',
  baseUrl: PLATFORM_API_URL,
  ingestBaseUrl: PLATFORM_INGEST_URL,
  eventAllowlist: [],
  eventContext: {platform: 'ait', appVersion: APP_VERSION},
  // Central registry and canary gates must pass before this opt-in changes.
  presenceEnabled: BABYCARE_AIT_PRESENCE_ENABLED,
  presenceContext: {platform: 'ait', appVersion: APP_VERSION},
});

export function prepareAitPresenceSession(): void {
  if (!BABYCARE_AIT_PRESENCE_ENABLED) return;
  void currentFirebaseIdToken()
    .then(token =>
      token
        ? aitPresencePlatform.signIn({
            kind: 'firebase-id-token',
            value: token,
          })
        : undefined,
    )
    .then(() => aitPresencePlatform.presence.start())
    .catch(() => undefined);
}

export function handleAitPresenceAppState(state: AppStateStatus): void {
  if (state === 'active') {
    aitPresencePlatform.presence.start();
    aitPresencePlatform.presence.resume();
    return;
  }
  aitPresencePlatform.presence.stop();
}

export function stopAitPresence(): void {
  aitPresencePlatform.presence.stop();
}
