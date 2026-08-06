import type {ReactNativeFirebase} from '@react-native-firebase/app';
import {
  ReactNativeFirebaseAppCheckProvider,
  getToken,
  initializeAppCheck,
} from '@react-native-firebase/app-check';

export interface FirebaseAppCheckTokenSource {
  getToken(forceRefresh?: boolean): Promise<string>;
}

export interface FirebaseAppCheckInitializerInput {
  readonly app: ReactNativeFirebase.FirebaseApp;
  readonly dev: boolean;
  readonly platform: string;
  readonly source: 'native' | 'emulator';
}

export type FirebaseAppCheckInitializer = (
  input: FirebaseAppCheckInitializerInput,
) => Promise<FirebaseAppCheckTokenSource | undefined>;

/**
 * App Check must be initialized before Auth, Firestore, or Functions are used.
 * Emulator runtimes stay outside enforcement so local development never needs
 * a production attestation provider or a checked-in debug token.
 */
export const initializeFirebaseAppCheck: FirebaseAppCheckInitializer = async ({
  app,
  dev,
  platform,
  source,
}) => {
  if (source === 'emulator') {
    return undefined;
  }
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(`Firebase App Check does not support platform: ${platform}`);
  }

  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: {provider: dev ? 'debug' : 'playIntegrity'},
    apple: {
      provider: dev ? 'debug' : 'appAttestWithDeviceCheckFallback',
    },
  });
  const appCheck = await initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return {
    async getToken(forceRefresh = false) {
      const result = await getToken(appCheck, forceRefresh);
      if (!result.token.trim()) {
        throw new Error('Firebase App Check returned an empty token');
      }
      return result.token;
    },
  };
};
