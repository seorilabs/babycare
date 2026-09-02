import {NativeModules, Platform} from 'react-native';
import {
  getApps,
  initializeApp,
  type ReactNativeFirebase,
} from '@react-native-firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getIdToken,
  type Auth,
} from '@react-native-firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  type Firestore,
} from '@react-native-firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from '@react-native-firebase/functions';
import {getVersion} from 'react-native-device-info';
import type {
  AccountDeletionPort,
  AnalyticsPort,
  BootStage,
  CareGroupInvite,
  ClockPort,
  IdGeneratorPort,
  Membership,
  RewardedAdPort,
  UserId,
} from '@babycare/product-core';
import {createRemoveGroupMember} from '@babycare/product-core';
import {
  FanOutAnalytics,
  PlatformAnalytics,
  type CareEventTimelineFeedConfig,
  type PlatformAnalyticsContext,
} from '@babycare/product-data';

import {FirebaseAnalyticsAdapter} from '../adapters/analytics/firebase-analytics-adapter';
import {
  MobileRewardedAd,
  showMobileAdPrivacyOptions,
} from '../adapters/ads/mobile-rewarded-ad';
import {FirebaseAuthAdapter} from '../adapters/firebase/firebase-auth-adapter';
import {
  initializeFirebaseAppCheck,
  type FirebaseAppCheckInitializer,
} from '../adapters/firebase/firebase-app-check';
import {FirebaseAccountDeletionService} from '../adapters/firebase/firebase-account-deletion-service';
import {FirebaseBabyRepository} from '../adapters/firebase/firebase-baby-repository';
import {FirebaseCareEventRemoteStore} from '../adapters/firebase/firebase-care-event-repository';
import {FirebaseCareGroupRepository} from '../adapters/firebase/firebase-care-group-repository';
import {FirebaseInviteService} from '../adapters/firebase/firebase-invite-service';
import {NativeIdGenerator} from '../adapters/system/native-id-generator';
import {
  PLATFORM_FIREBASE_AUTH_CONFIG,
  PLATFORM_EVENTS_URL,
  PlatformFirebaseCustomTokenBridge,
  type FirebaseCustomTokenBridge,
} from '../adapters/platform/platform-firebase-custom-token-bridge';
import {createCareEventContainer} from './care-event-container';
import {
  RandomCareDocumentIdFactory,
  type CareDocumentIdFactory,
  type FirebaseSessionServices,
  type ReadyFirebaseSession,
} from './firebase-session';
import type {CareSessionRevocationReason} from './care-session-lifecycle';

const EMULATOR_APP_NAME = 'babycare-emulator';

export const FIREBASE_EMULATOR_RUNTIME_CONFIG = {
  projectId: 'demo-babycare',
  functionsRegion: 'us-central1',
  authPort: 9099,
  firestorePort: 8085,
  functionsPort: 5001,
} as const;

// Production Cloud Functions region for the native Firebase app. Deployed to
// seorilabs-babycare (asia-northeast3). Must match the Functions deploy region.
export const FIREBASE_CLOUD_RUNTIME_CONFIG = {
  functionsRegion: 'asia-northeast3',
} as const;

export const FIREBASE_CARE_EVENT_TIMELINE_CONFIG: CareEventTimelineFeedConfig = {
  pageSize: 20,
  maxCachedEvents: 200,
  maxScanPagesPerLoad: 3,
};

export class FirebaseRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseRuntimeConfigurationError';
  }
}

export interface FirebaseRuntimeEmulatorConfig {
  readonly projectId?: string;
  readonly functionsRegion?: string;
  readonly host?: string;
  readonly authPort?: number;
  readonly firestorePort?: number;
  readonly functionsPort?: number;
}

export interface FirebaseRuntimeOptions {
  /** Required for a native Firebase app. Never infer a production region. */
  readonly functionsRegion?: string;
  readonly emulator?: FirebaseRuntimeEmulatorConfig;
  readonly dev?: boolean;
  readonly metroScriptURL?: string;
  readonly platform?: string;
  readonly clock?: ClockPort;
  readonly documentIds?: CareDocumentIdFactory;
  readonly eventIds?: IdGeneratorPort;
  readonly analytics?: AnalyticsPort;
  readonly rewardedAd?: RewardedAdPort;
  readonly adPrivacyOptions?: () => Promise<boolean>;
  readonly timeline?: CareEventTimelineFeedConfig;
  readonly authBridge?: FirebaseCustomTokenBridge;
  readonly accountDeletion?: AccountDeletionPort;
  readonly appCheck?: FirebaseAppCheckInitializer;
  readonly bootObserver?: FirebaseBootObserver;
}

export interface FirebaseBootObserver {
  readonly onStage?: (stage: BootStage) => void;
  readonly onAnalyticsReady?: (analytics: AnalyticsPort) => void;
}

export interface FirebaseCareEventRuntimeCallbacks {
  readonly onRevoked: (reason: CareSessionRevocationReason) => void;
  readonly onError: (error: Error) => void;
}

export interface FirebaseRuntime {
  readonly kind: 'firebase';
  readonly mode: 'emulator' | 'cloud';
  readonly label: 'Firebase Emulator' | 'Firebase Cloud';
  readonly source: 'native' | 'emulator';
  readonly app: ReactNativeFirebase.FirebaseApp;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly functions: Functions;
  readonly functionsRegion: string;
  readonly analytics: AnalyticsPort;
  readonly rewardedAd: RewardedAdPort;
  readonly openAdPrivacyOptions: () => Promise<boolean>;
  readonly emulatorHost?: string;
  readonly sessionServices: FirebaseSessionServices;
  readonly firebaseIdToken: () => Promise<string | undefined>;
  createCareContainer(
    session: ReadyFirebaseSession,
    callbacks: FirebaseCareEventRuntimeCallbacks,
  ): ReturnType<typeof createCareEventContainer>;
  createInvite(session: ReadyFirebaseSession): Promise<CareGroupInvite>;
  deleteAccount(userId: UserId): Promise<void>;
  refreshMemberships(
    session: ReadyFirebaseSession,
  ): Promise<readonly Membership[]>;
  removeMember(session: ReadyFirebaseSession, targetId: UserId): Promise<void>;
  /** @deprecated Prefer createCareContainer. */
  createCareEventRuntime(
    session: ReadyFirebaseSession,
    callbacks: FirebaseCareEventRuntimeCallbacks,
  ): ReturnType<typeof createCareEventContainer>;
}

let defaultRuntimePromise: Promise<FirebaseRuntime> | undefined;

function positivePort(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > 65_535) {
    throw new FirebaseRuntimeConfigurationError(`${label} must be a valid TCP port`);
  }
  return resolved;
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolvePlatformAnalyticsContext(input: {
  readonly platform: string;
  readonly appVersion?: string;
  readonly locale?: string;
}): PlatformAnalyticsContext {
  const appVersion = nonEmpty(input.appVersion);
  const locale = nonEmpty(input.locale);
  return {
    platform: input.platform === 'ios' ? 'ios' : 'android',
    ...(appVersion ? {appVersion} : {}),
    ...(locale ? {locale} : {}),
  };
}

function sourceCodeScriptURL(): string | undefined {
  const sourceCode = NativeModules.SourceCode as
    | {readonly scriptURL?: unknown}
    | undefined;
  return typeof sourceCode?.scriptURL === 'string'
    ? sourceCode.scriptURL
    : undefined;
}

/**
 * Physical Android devices and Android emulators use adb reverse in the local
 * run script. Prefer that loopback tunnel over the Android-emulator-only
 * 10.0.2.2 address, which React Native can also report for a USB device.
 */
export function resolveFirebaseEmulatorHost(input: {
  readonly explicitHost?: string;
  readonly metroScriptURL?: string;
  readonly platform?: string;
} = {}): string {
  const explicit = nonEmpty(input.explicitHost);
  if (explicit) {
    return explicit.replace(/^\[|\]$/g, '');
  }

  const scriptURL = nonEmpty(input.metroScriptURL);
  if (scriptURL) {
    const match = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(
      scriptURL,
    );
    if (match?.[1]) {
      const host = match[1].replace(/^\[|\]$/g, '');
      return input.platform === 'android' && host === '10.0.2.2'
        ? '127.0.0.1'
        : host;
    }
  }

  return '127.0.0.1';
}

function hostForURL(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function emulatorAppOptions(
  projectId: string,
  platform: string,
): ReactNativeFirebase.FirebaseAppOptions {
  const target = platform === 'ios' ? 'ios' : 'android';
  return {
    apiKey: 'babycare-emulator-api-key',
    appId: `1:000000000000:${target}:0000000000000000`,
    databaseURL: `http://127.0.0.1:9000?ns=${projectId}`,
    messagingSenderId: '000000000000',
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  };
}

export function bootstrapFirebaseRuntime(
  observer?: FirebaseBootObserver,
): Promise<FirebaseRuntime> {
  defaultRuntimePromise ??= createFirebaseRuntime({bootObserver: observer}).catch(error => {
    defaultRuntimePromise = undefined;
    throw error;
  });
  return defaultRuntimePromise;
}

async function resolveApp(input: {
  readonly dev: boolean;
  readonly platform: string;
  readonly projectId: string;
}): Promise<{
  readonly app: ReactNativeFirebase.FirebaseApp;
  readonly source: 'native' | 'emulator';
}> {
  const apps = getApps();
  const native = apps.find(app => app.name !== EMULATOR_APP_NAME);
  if (native) {
    return {app: native, source: 'native'};
  }
  const existingEmulator = apps.find(app => app.name === EMULATOR_APP_NAME);
  if (existingEmulator) {
    return {app: existingEmulator, source: 'emulator'};
  }
  if (!input.dev) {
    throw new FirebaseRuntimeConfigurationError(
      'Firebase native client configuration is missing from this release build',
    );
  }
  const app = await initializeApp(
    emulatorAppOptions(input.projectId, input.platform),
    {name: EMULATOR_APP_NAME, automaticDataCollectionEnabled: false},
  );
  return {app, source: 'emulator'};
}

export async function createFirebaseRuntime(
  options: FirebaseRuntimeOptions = {},
): Promise<FirebaseRuntime> {
  options.bootObserver?.onStage?.('runtime');
  const dev = options.dev ?? __DEV__;
  const platform = options.platform ?? Platform.OS;
  const emulatorProjectId =
    nonEmpty(options.emulator?.projectId) ??
    FIREBASE_EMULATOR_RUNTIME_CONFIG.projectId;
  const resolved = await resolveApp({
    dev,
    platform,
    projectId: emulatorProjectId,
  });
  const functionsRegion =
    nonEmpty(options.functionsRegion) ??
    (resolved.source === 'emulator'
      ? nonEmpty(options.emulator?.functionsRegion) ??
        FIREBASE_EMULATOR_RUNTIME_CONFIG.functionsRegion
      : FIREBASE_CLOUD_RUNTIME_CONFIG.functionsRegion);
  if (!functionsRegion) {
    throw new FirebaseRuntimeConfigurationError(
      'Firebase Functions region must be supplied for a native Firebase app',
    );
  }

  const auth = getAuth(resolved.app);
  const analytics =
    options.analytics ??
    (resolved.source === 'native'
      ? new FanOutAnalytics([
          new FirebaseAnalyticsAdapter(resolved.app),
          new PlatformAnalytics({
            baseUrl: PLATFORM_FIREBASE_AUTH_CONFIG.baseUrl,
            eventsBaseUrl: PLATFORM_EVENTS_URL,
            firebaseIdToken: async () => {
              const user = auth.currentUser;
              return user ? getIdToken(user) : undefined;
            },
            context: resolvePlatformAnalyticsContext({
              platform,
              appVersion: getVersion(),
              locale: Intl.DateTimeFormat().resolvedOptions().locale,
            }),
          }),
        ])
      : {track: async () => undefined});
  options.bootObserver?.onAnalyticsReady?.(analytics);
  options.bootObserver?.onStage?.('app_check');
  const appCheck = await (options.appCheck ?? initializeFirebaseAppCheck)({
    app: resolved.app,
    dev,
    platform,
    source: resolved.source,
  });

  options.bootObserver?.onStage?.('auth');
  // The durable BabyCare outbox is the only disk-backed event queue. Configure
  // Firestore before any repository can issue a read or write.
  const firestore = await initializeFirestore(resolved.app, {
    persistence: false,
  });
  const functions = getFunctions(resolved.app, functionsRegion);
  let emulatorHost: string | undefined;

  if (resolved.source === 'emulator') {
    emulatorHost = resolveFirebaseEmulatorHost({
      explicitHost: options.emulator?.host,
      metroScriptURL: options.metroScriptURL ?? sourceCodeScriptURL(),
      platform,
    });
    const authPort = positivePort(
      options.emulator?.authPort,
      FIREBASE_EMULATOR_RUNTIME_CONFIG.authPort,
      'Auth emulator port',
    );
    const firestorePort = positivePort(
      options.emulator?.firestorePort,
      FIREBASE_EMULATOR_RUNTIME_CONFIG.firestorePort,
      'Firestore emulator port',
    );
    const functionsPort = positivePort(
      options.emulator?.functionsPort,
      FIREBASE_EMULATOR_RUNTIME_CONFIG.functionsPort,
      'Functions emulator port',
    );
    connectAuthEmulator(
      auth,
      `http://${hostForURL(emulatorHost)}:${authPort}`,
      {disableWarnings: true},
    );
    connectFirestoreEmulator(firestore, emulatorHost, firestorePort);
    connectFunctionsEmulator(functions, emulatorHost, functionsPort);
  }

  const authBridge =
    options.authBridge ??
    (resolved.source === 'native'
      ? new PlatformFirebaseCustomTokenBridge({
          appCheckToken: appCheck
            ? () => appCheck.getToken()
            : undefined,
        })
      : undefined);
  const authAdapter = new FirebaseAuthAdapter(
    auth,
    authBridge,
    resolved.source === 'emulator',
  );
  const groups = new FirebaseCareGroupRepository(firestore);
  const babies = new FirebaseBabyRepository(firestore);
  const invites = new FirebaseInviteService(functions, authAdapter);
  const accountDeletion =
    options.accountDeletion ??
    new FirebaseAccountDeletionService(
      functions,
      authAdapter,
      auth,
      authBridge,
    );
  const clock = options.clock ?? {now: () => Date.now()};
  const documentIds = options.documentIds ?? new RandomCareDocumentIdFactory();
  const eventIds = options.eventIds ?? new NativeIdGenerator();
  const rewardedAd =
    options.rewardedAd ??
    (resolved.source === 'native'
      ? new MobileRewardedAd()
      : {
          preload: async () => undefined,
          show: async () => ({status: 'unavailable' as const}),
        });
  const openAdPrivacyOptions =
    options.adPrivacyOptions ??
    (resolved.source === 'native'
      ? showMobileAdPrivacyOptions
      : async () => false);
  rewardedAd.preload().catch(() => undefined);
  const timeline = options.timeline ?? FIREBASE_CARE_EVENT_TIMELINE_CONFIG;
  const sessionServices: FirebaseSessionServices = {
    auth: authAdapter,
    groups,
    babies,
    invites,
    clock,
    documentIds,
  };

  const removeGroupMember = createRemoveGroupMember(groups);

  const createCareContainer = (
    session: ReadyFirebaseSession,
    callbacks: FirebaseCareEventRuntimeCallbacks,
  ) => {
    const remote = new FirebaseCareEventRemoteStore(
      firestore,
      session.context.identity.userId,
      callbacks.onError,
    );
    return createCareEventContainer({
      context: session.context,
      auth: authAdapter,
      groups,
      remote,
      timeline,
      clock,
      idGenerator: eventIds,
      analytics,
      onRevoked: callbacks.onRevoked,
      onError: callbacks.onError,
    });
  };

  return {
    kind: 'firebase',
    mode: resolved.source === 'emulator' ? 'emulator' : 'cloud',
    label:
      resolved.source === 'emulator'
        ? 'Firebase Emulator'
        : 'Firebase Cloud',
    source: resolved.source,
    app: resolved.app,
    auth,
    firestore,
    functions,
    functionsRegion,
    analytics,
    rewardedAd,
    openAdPrivacyOptions,
    ...(emulatorHost ? {emulatorHost} : {}),
    sessionServices,
    firebaseIdToken: async () => {
      const user = auth.currentUser;
      return user ? getIdToken(user) : undefined;
    },
    createCareContainer,
    createInvite(session) {
      return invites.createInvite({
        groupId: session.context.group.id,
        requestedBy: session.context.identity.userId,
      });
    },
    deleteAccount(userId) {
      return accountDeletion.deleteAccount({
        userId,
        confirmation: 'DELETE',
      });
    },
    refreshMemberships(session) {
      return groups.listMemberships(session.context.group.id);
    },
    removeMember(session, targetId) {
      return removeGroupMember({
        groupId: session.context.group.id,
        actorId: session.context.identity.userId,
        targetId,
      });
    },
    createCareEventRuntime: createCareContainer,
  };
}
