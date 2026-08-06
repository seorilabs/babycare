jest.mock('@react-native-firebase/app-check', () => ({
  ReactNativeFirebaseAppCheckProvider: jest.fn().mockImplementation(() => ({
    configure: jest.fn(),
  })),
  initializeAppCheck: jest.fn(),
  getToken: jest.fn(),
}));

import {
  ReactNativeFirebaseAppCheckProvider,
  getToken,
  initializeAppCheck,
} from '@react-native-firebase/app-check';

import {initializeFirebaseAppCheck} from '../src/adapters/firebase/firebase-app-check';

const app = {name: '[DEFAULT]'} as never;

beforeEach(() => {
  jest.clearAllMocks();
});

it('skips App Check for the Firebase emulator runtime', async () => {
  await expect(
    initializeFirebaseAppCheck({
      app,
      dev: true,
      platform: 'ios',
      source: 'emulator',
    }),
  ).resolves.toBeUndefined();
  expect(initializeAppCheck).not.toHaveBeenCalled();
});

it.each([
  ['android', 'playIntegrity'],
  ['ios', 'appAttestWithDeviceCheckFallback'],
] as const)('configures the release provider for %s', async (platform, providerName) => {
  const provider = {configure: jest.fn()};
  (ReactNativeFirebaseAppCheckProvider as jest.Mock).mockImplementationOnce(
    () => provider,
  );
  (initializeAppCheck as jest.Mock).mockResolvedValueOnce({app});
  (getToken as jest.Mock).mockResolvedValueOnce({token: 'attested-token'});

  const source = await initializeFirebaseAppCheck({
    app,
    dev: false,
    platform,
    source: 'native',
  });

  expect(provider.configure).toHaveBeenCalledWith(
    expect.objectContaining({
      android: expect.any(Object),
      apple: expect.any(Object),
    }),
  );
  const configured = provider.configure.mock.calls[0]![0];
  expect(
    platform === 'android'
      ? configured.android.provider
      : configured.apple.provider,
  ).toBe(providerName);
  expect(initializeAppCheck).toHaveBeenCalledWith(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
  await expect(source?.getToken()).resolves.toBe('attested-token');
});

it('uses debug providers without embedding a debug token', async () => {
  const provider = {configure: jest.fn()};
  (ReactNativeFirebaseAppCheckProvider as jest.Mock).mockImplementationOnce(
    () => provider,
  );
  (initializeAppCheck as jest.Mock).mockResolvedValueOnce({app});

  await initializeFirebaseAppCheck({
    app,
    dev: true,
    platform: 'ios',
    source: 'native',
  });

  expect(provider.configure).toHaveBeenCalledWith({
    android: {provider: 'debug'},
    apple: {provider: 'debug'},
  });
});
