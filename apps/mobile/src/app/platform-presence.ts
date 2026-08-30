import {createPlatform} from '@seorilabs/platform-sdk';
import {Platform, type AppStateStatus} from 'react-native';
import {getVersion} from 'react-native-device-info';

const PLATFORM_API_URL =
  'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_INGEST_URL =
  'https://platform-ingest-306278488979.asia-northeast3.run.app';

export const BABYCARE_PRESENCE_ENABLED = false;

const mobilePresencePlatform = createPlatform({
  appId: 'babycare',
  baseUrl: PLATFORM_API_URL,
  ingestBaseUrl: PLATFORM_INGEST_URL,
  eventAllowlist: [],
  eventContext: () => ({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: getVersion(),
  }),
  // Central registry and canary gates must pass before this opt-in changes.
  presenceEnabled: BABYCARE_PRESENCE_ENABLED,
  presenceContext: () => ({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: getVersion(),
  }),
});

export function prepareMobilePresenceSession(
  firebaseIdToken: () => Promise<string | undefined>,
): void {
  if (!BABYCARE_PRESENCE_ENABLED) return;
  firebaseIdToken()
    .then(token =>
      token
        ? mobilePresencePlatform.signIn({
            kind: 'firebase-id-token',
            value: token,
          })
        : undefined,
    )
    .then(() => mobilePresencePlatform.presence.start())
    .catch(() => undefined);
}

export function handleMobilePresenceAppState(state: AppStateStatus): void {
  if (state === 'active') {
    mobilePresencePlatform.presence.start();
    mobilePresencePlatform.presence.resume();
    return;
  }
  mobilePresencePlatform.presence.stop();
}

export function stopMobilePresence(): void {
  mobilePresencePlatform.presence.stop();
}
