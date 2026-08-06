jest.mock('@react-native-firebase/app', () => ({
  getApps: jest.fn(),
  initializeApp: jest.fn(),
}));

jest.mock('@react-native-firebase/app-check', () => ({
  ReactNativeFirebaseAppCheckProvider: jest.fn(),
  getToken: jest.fn(),
  initializeAppCheck: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => ({
  connectAuthEmulator: jest.fn(),
  getAuth: jest.fn(),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  connectFirestoreEmulator: jest.fn(),
  initializeFirestore: jest.fn(),
}));

jest.mock('@react-native-firebase/functions', () => ({
  connectFunctionsEmulator: jest.fn(),
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(() => jest.fn()),
}));

jest.mock('../src/app/care-event-container', () => ({
  createCareEventContainer: jest.fn(async dependencies => dependencies),
}));

import {getApps, initializeApp} from '@react-native-firebase/app';
import {connectAuthEmulator, getAuth} from '@react-native-firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from '@react-native-firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
} from '@react-native-firebase/functions';
import {createCareEventContainer} from '../src/app/care-event-container';

import {
  createFirebaseRuntime,
  resolveFirebaseEmulatorHost,
} from '../src/app/firebase-runtime';
import {
  babyId,
  groupId,
  userId,
  type AuthIdentity,
  type Baby,
  type CareGroup,
  type Membership,
} from '@babycare/product-core';

const mockGetApps = getApps as jest.MockedFunction<typeof getApps>;
const mockInitializeApp = initializeApp as jest.MockedFunction<
  typeof initializeApp
>;
const mockGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockConnectAuthEmulator = connectAuthEmulator as jest.MockedFunction<
  typeof connectAuthEmulator
>;
const mockInitializeFirestore =
  initializeFirestore as jest.MockedFunction<typeof initializeFirestore>;
const mockConnectFirestoreEmulator =
  connectFirestoreEmulator as jest.MockedFunction<
    typeof connectFirestoreEmulator
  >;
const mockGetFunctions = getFunctions as jest.MockedFunction<
  typeof getFunctions
>;
const mockConnectFunctionsEmulator =
  connectFunctionsEmulator as jest.MockedFunction<
    typeof connectFunctionsEmulator
  >;
const mockCreateCareEventContainer =
  createCareEventContainer as jest.MockedFunction<
    typeof createCareEventContainer
  >;

const nativeApp = {name: '[DEFAULT]'} as unknown as ReturnType<
  typeof getApps
>[number];
const emulatorApp = {name: 'babycare-emulator'} as unknown as ReturnType<
  typeof getApps
>[number];
const auth = {currentUser: null} as unknown as ReturnType<typeof getAuth>;
const firestore = {name: 'firestore'} as unknown as Awaited<
  ReturnType<typeof initializeFirestore>
>;
const functions = {name: 'functions'} as unknown as ReturnType<
  typeof getFunctions
>;
const appCheck = jest.fn(async () => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApps.mockReturnValue([]);
  mockInitializeApp.mockResolvedValue(emulatorApp);
  mockGetAuth.mockReturnValue(auth);
  mockInitializeFirestore.mockResolvedValue(firestore);
  mockGetFunctions.mockReturnValue(functions);
  appCheck.mockClear();
});

it('resolves a physical-device emulator host from the Metro script URL', () => {
  expect(
    resolveFirebaseEmulatorHost({
      metroScriptURL: 'http://192.168.0.24:8081/index.bundle?platform=ios',
      platform: 'ios',
    }),
  ).toBe('192.168.0.24');
  expect(
    resolveFirebaseEmulatorHost({
      metroScriptURL: 'http://[::1]:8081/index.bundle?platform=ios',
    }),
  ).toBe('::1');
  expect(resolveFirebaseEmulatorHost({platform: 'android'})).toBe('127.0.0.1');
  expect(
    resolveFirebaseEmulatorHost({
      metroScriptURL: 'http://10.0.2.2:8081/index.bundle?platform=android',
      platform: 'android',
    }),
  ).toBe('127.0.0.1');
});

it('creates a dummy dev app and connects every emulator before adapters are used', async () => {
  const runtime = await createFirebaseRuntime({
    dev: true,
    platform: 'ios',
    metroScriptURL: 'http://192.168.0.24:8081/index.bundle',
    emulator: {functionsRegion: 'asia-northeast3'},
    appCheck,
  });

  expect(mockInitializeApp).toHaveBeenCalledWith(
    expect.objectContaining({projectId: 'demo-babycare'}),
    expect.objectContaining({name: 'babycare-emulator'}),
  );
  expect(appCheck).toHaveBeenCalledWith({
    app: emulatorApp,
    dev: true,
    platform: 'ios',
    source: 'emulator',
  });
  expect(mockInitializeFirestore).toHaveBeenCalledWith(emulatorApp, {
    persistence: false,
  });
  expect(mockGetFunctions).toHaveBeenCalledWith(
    emulatorApp,
    'asia-northeast3',
  );
  expect(mockConnectAuthEmulator).toHaveBeenCalledWith(
    auth,
    'http://192.168.0.24:9099',
    {disableWarnings: true},
  );
  expect(mockConnectFirestoreEmulator).toHaveBeenCalledWith(
    firestore,
    '192.168.0.24',
    8085,
  );
  expect(mockConnectFunctionsEmulator).toHaveBeenCalledWith(
    functions,
    '192.168.0.24',
    5001,
  );
  expect(runtime).toMatchObject({
    kind: 'firebase',
    source: 'emulator',
    emulatorHost: '192.168.0.24',
    functionsRegion: 'asia-northeast3',
  });
});

it('uses a native app without emulator connections and defaults to the deployed production region', async () => {
  mockGetApps.mockReturnValue([nativeApp]);

  // A native (release) Firebase app defaults the Functions region to the
  // deployed production region (asia-northeast3) rather than requiring an
  // injected region — see FIREBASE_CLOUD_RUNTIME_CONFIG.
  const runtime = await createFirebaseRuntime({
    dev: false,
    platform: 'ios',
    appCheck,
  });

  expect(runtime.source).toBe('native');
  expect(runtime.functionsRegion).toBe('asia-northeast3');
  expect(mockInitializeApp).not.toHaveBeenCalled();
  expect(mockGetFunctions).toHaveBeenCalledWith(nativeApp, 'asia-northeast3');
  expect(appCheck).toHaveBeenCalledWith({
    app: nativeApp,
    dev: false,
    platform: 'ios',
    source: 'native',
  });
  expect(mockInitializeFirestore).toHaveBeenCalledWith(nativeApp, {
    persistence: false,
  });
  expect(mockConnectAuthEmulator).not.toHaveBeenCalled();
  expect(mockConnectFirestoreEmulator).not.toHaveBeenCalled();
  expect(mockConnectFunctionsEmulator).not.toHaveBeenCalled();
});

it('lets an injected region override the native default', async () => {
  mockGetApps.mockReturnValue([nativeApp]);

  const runtime = await createFirebaseRuntime({
    dev: false,
    platform: 'ios',
    functionsRegion: 'us-central1',
    appCheck,
  });

  expect(runtime.source).toBe('native');
  expect(runtime.functionsRegion).toBe('us-central1');
  expect(mockGetFunctions).toHaveBeenCalledWith(nativeApp, 'us-central1');
  expect(mockInitializeApp).not.toHaveBeenCalled();
});

it('fails explicitly when a release build has no native Firebase app', async () => {
  await expect(
    createFirebaseRuntime({dev: false, platform: 'ios', appCheck}),
  ).rejects.toThrow(
    'Firebase native client configuration is missing from this release build',
  );
  expect(mockInitializeApp).not.toHaveBeenCalled();
});

it('builds the scoped care-event container from a ready Firebase session', async () => {
  const identity: AuthIdentity = {
    userId: userId('runtime-user'),
    displayName: '보호자',
    isAnonymous: true,
  };
  const group: CareGroup = {
    id: groupId('runtime-group'),
    name: '돌봄 그룹',
    ownerId: identity.userId,
    babyIds: [babyId('runtime-baby')],
    createdAt: 1,
    updatedAt: 1,
  };
  const membership: Membership = {
    groupId: group.id,
    userId: identity.userId,
    caregiverRole: 'other',
    membershipRole: 'owner',
    displayName: '보호자',
    color: '#5FB49C',
    joinedAt: 1,
  };
  const baby: Baby = {
    id: group.babyIds[0],
    groupId: group.id,
    name: '아기',
    birthDate: '2026-01-01',
    sex: 'unspecified',
    createdAt: 1,
    updatedAt: 1,
  };
  const onRevoked = jest.fn();
  const onError = jest.fn();
  const runtime = await createFirebaseRuntime({
    dev: true,
    platform: 'ios',
    metroScriptURL: 'http://127.0.0.1:8081/index.bundle',
    appCheck,
  });

  await runtime.createCareEventRuntime(
    {context: {identity, group, membership, baby}, memberships: [membership]},
    {onRevoked, onError},
  );

  expect(mockCreateCareEventContainer).toHaveBeenCalledWith(
    expect.objectContaining({
      context: {identity, group, membership, baby},
      onRevoked,
      onError,
      timeline: {
        pageSize: 20,
        maxCachedEvents: 200,
        maxScanPagesPerLoad: 3,
      },
    }),
  );
});
