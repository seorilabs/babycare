import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {CareEventKind} from '@babycare/product-core';
import type {
  CareEventOverviewFeedState,
  CareEventSyncState,
  CareEventTimelineFeedState,
} from '@babycare/product-data';

import {
  CloudCareContextCache,
  CloudCareContextHydrationError,
  CloudCareContextSessionStore,
  type CloudCareContextSessionToken,
} from '../adapters/local/cloud-care-context-cache';
import {SyncStatusBanner} from '../components/SyncStatusBanner';
import {QuickRecordModal} from '../components/QuickRecordModal';
import {TabBar, type AppTab} from '../components/TabBar';
import {CloudOnboardingScreen} from '../screens/CloudOnboardingScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {MoreScreen} from '../screens/MoreScreen';
import {StatsScreen} from '../screens/StatsScreen';
import {TimelineScreen} from '../screens/TimelineScreen';
import {AccountDeletionIntentStore} from './account-deletion-intent-store';
import {createStrings, deviceAppLocale, type Strings} from './i18n';
import {createTheme} from './theme';
import {
  createOwnerFirebaseSession,
  firebaseSessionView,
  joinFirebaseSession,
  restoreFirebaseSession,
  type ReadyFirebaseSession,
} from './firebase-session';
import {
  bootstrapFirebaseRuntime,
  type FirebaseRuntime,
} from './firebase-runtime';

type CareContainer = Awaited<
  ReturnType<FirebaseRuntime['createCareContainer']>
>;

type RootState =
  | {readonly kind: 'loading'}
  | {
      readonly kind: 'setup';
      readonly runtime: FirebaseRuntime;
      readonly notice?: string;
    }
  | {
      readonly kind: 'active';
      readonly runtime: FirebaseRuntime;
      readonly ready: ReadyFirebaseSession;
      readonly container: CareContainer;
      readonly sessionToken: CloudCareContextSessionToken;
      readonly invite?: {readonly code: string; readonly expiresAt: number};
    }
  | {readonly kind: 'error'; readonly error: Error};

const EMPTY_TIMELINE: CareEventTimelineFeedState = {
  events: [],
  hasMore: true,
  loadingMore: false,
  loadMoreError: undefined,
  capped: false,
};

const EMPTY_OVERVIEW: CareEventOverviewFeedState = {
  events: [],
  activeSleep: undefined,
  status: 'loading',
};

function userFacingError(message: string, cause: unknown): Error {
  const error = new Error(message);
  Object.defineProperty(error, 'cause', {value: cause});
  return error;
}

export function FirebaseCareDashboard(props: {
  readonly runtime: FirebaseRuntime;
  readonly ready: ReadyFirebaseSession;
  readonly container: CareContainer;
  readonly invite?: {readonly code: string; readonly expiresAt: number};
  readonly onInvite: () => Promise<void>;
  readonly onRefreshMembers: () => Promise<void>;
  readonly onDeleteAccount: () => Promise<void>;
  readonly onRuntimeError: (error: Error | undefined) => void;
  readonly runtimeError?: Error;
  readonly strings: Strings;
}) {
  const {onRuntimeError, strings} = props;
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => createTheme(dark), [dark]);
  const [overview, setOverview] = useState<CareEventOverviewFeedState>(
    EMPTY_OVERVIEW,
  );
  const [timeline, setTimeline] =
    useState<CareEventTimelineFeedState>(EMPTY_TIMELINE);
  const [syncStates, setSyncStates] = useState<readonly CareEventSyncState[]>(
    [],
  );
  const [tab, setTab] = useState<AppTab>('home');
  const [recording, setRecording] = useState<CareEventKind>();
  const [now, setNow] = useState(Date.now());
  const [savedMessage, setSavedMessage] = useState<string>();
  const session = firebaseSessionView(
    props.ready,
    props.invite?.code ?? '',
  );
  const caregiverNames = new Map(
    props.ready.memberships.map(membership => [
      membership.userId,
      membership.displayName,
    ]),
  );

  useEffect(() => {
    const stopOverview = props.container.overviewFeed.start(setOverview);
    const stopTimeline = props.container.timelineFeed.start(setTimeline);
    const stopSync = props.container.observeSyncState(setSyncStates);
    return () => {
      stopSync();
      stopTimeline();
      stopOverview();
      props.container.dispose().catch(() => undefined);
    };
  }, [props.container]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    props.runtime.analytics
      ?.track({
        name: 'core_screen_view',
        params: {screen_name: tab, screen_class: 'FirebaseCareDashboard'},
      })
      .catch(() => undefined);
  }, [props.runtime.analytics, tab]);

  useEffect(() => {
    if (!savedMessage) {
      return undefined;
    }
    const timeout = setTimeout(() => setSavedMessage(undefined), 1_800);
    return () => clearTimeout(timeout);
  }, [savedMessage]);

  useEffect(() => {
    if (overview.status === 'error' && overview.error) {
      onRuntimeError(
        userFacingError(
          strings.app.overviewRefreshFailed,
          overview.error.cause,
        ),
      );
    }
  }, [onRuntimeError, overview.error, overview.status, strings]);

  const showError = (title: string, message: string, error: unknown) => {
    const value = userFacingError(message, error);
    onRuntimeError(value);
    Alert.alert(title, value.message);
  };

  const renderTab = () => {
    if (tab === 'timeline') {
      return (
        <TimelineScreen
          capped={timeline.capped}
          events={timeline.events}
          caregiverNames={caregiverNames}
          hasMore={timeline.hasMore}
          loadingMore={timeline.loadingMore}
          loadMoreError={timeline.loadMoreError}
          now={now}
          onDelete={async event => {
            try {
              await props.container.softDeleteCareEvent({
                groupId: props.ready.context.group.id,
                eventId: event.id,
                requestedBy: props.ready.context.identity.userId,
              });
              setSavedMessage(strings.app.eventDeleted);
            } catch (error) {
              showError(
                strings.app.deleteEventFailedTitle,
                strings.app.deleteEventFailedMessage,
                error,
              );
            }
          }}
          onLoadMore={() => props.container.timelineFeed.loadMore()}
          onRetryLoadMore={() => props.container.timelineFeed.retryLoadMore()}
          session={session}
          strings={strings}
          theme={theme}
        />
      );
    }
    if (tab === 'stats') {
      return (
        <StatsScreen
          events={overview.events}
          now={now}
          analytics={props.runtime.analytics}
          rewardedAd={props.runtime.rewardedAd}
          strings={strings}
          theme={theme}
        />
      );
    }
    if (tab === 'more') {
      return (
        <MoreScreen
          inviteExpiresAt={props.invite?.expiresAt}
          memberships={props.ready.memberships}
          onCreateInvite={props.onInvite}
          onDeleteAccount={props.onDeleteAccount}
          onOpenAdPrivacyOptions={props.runtime.openAdPrivacyOptions}
          onRefreshMembers={props.onRefreshMembers}
          onReset={async () => undefined}
          session={session}
          strings={strings}
          theme={theme}
        />
      );
    }
    return (
      <HomeScreen
        activeSleep={overview.activeSleep}
        caregiverNames={caregiverNames}
        events={overview.events}
        now={now}
        onMore={() => setTab('more')}
        onRecord={setRecording}
        onStopSleep={async event => {
          try {
            await props.container.endSleepSession({
              groupId: props.ready.context.group.id,
              eventId: event.id,
            });
            setNow(Date.now());
            setSavedMessage(strings.app.sleepRecorded);
          } catch (error) {
            showError(
              strings.app.stopSleepFailedTitle,
              strings.app.stopSleepFailedMessage,
              error,
            );
          }
        }}
        session={session}
        strings={strings}
        theme={theme}
      />
    );
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.app, {backgroundColor: theme.colors.background}]}>
      <StatusBar
        backgroundColor={theme.colors.background}
        barStyle={dark ? 'light-content' : 'dark-content'}
      />
      {props.runtimeError ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.runtimeError,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.danger,
            },
          ]}>
          <Text style={[styles.runtimeErrorText, {color: theme.colors.danger}]}>
            {props.runtimeError.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              props.onRuntimeError(undefined);
              Promise.all([
                props.container.overviewFeed.refresh(),
                props.container.timelineFeed.refresh(),
              ]).catch(error =>
                props.onRuntimeError(
                  userFacingError(strings.app.overviewRefreshFailed, error),
                ),
              );
            }}>
            <Text style={[styles.runtimeRetry, {color: theme.colors.primary}]}>
              {strings.common.refresh}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <SyncStatusBanner
        onRetry={() => {
          props.container.syncNow({retryFailed: true}).catch(error =>
            props.onRuntimeError(
              userFacingError(strings.app.syncRetryFailed, error),
            ),
          );
        }}
        states={syncStates}
        strings={strings}
        theme={theme}
      />
      <View style={styles.screen}>{renderTab()}</View>
      {savedMessage ? (
        <View style={[styles.toast, {backgroundColor: theme.colors.text}]}>
          <Text style={[styles.toastText, {color: theme.colors.background}]}>
            ✓ {savedMessage}
          </Text>
        </View>
      ) : null}
      <TabBar
        active={tab}
        onChange={setTab}
        strings={strings}
        theme={theme}
      />
      <QuickRecordModal
        kind={recording}
        onClose={() => setRecording(undefined)}
        onSave={async input => {
          await props.container.recordCareEvent(input);
          setNow(Date.now());
          setSavedMessage(strings.app.eventSaved);
        }}
        session={session}
        strings={strings}
        theme={theme}
      />
    </SafeAreaView>
  );
}

export function FirebaseBabyCareApp(
  props: {
    /** Test seam. Production resolves the locale from the device. */
    readonly strings?: Strings;
  } = {},
) {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => createTheme(dark), [dark]);
  // The device language is read once at mount: RN restarts the app when the
  // system language changes, so there is nothing to re-resolve at runtime.
  const overrideStrings = props.strings;
  const strings = useMemo(
    () => overrideStrings ?? createStrings(deviceAppLocale()),
    [overrideStrings],
  );
  const cache = useMemo(() => new CloudCareContextCache(), []);
  const sessionStore = useMemo(
    () => new CloudCareContextSessionStore(cache),
    [cache],
  );
  const accountDeletionIntents = useMemo(
    () => new AccountDeletionIntentStore(),
    [],
  );
  const mounted = useRef(true);
  const [state, setState] = useState<RootState>({kind: 'loading'});
  const [runtimeError, setRuntimeError] = useState<Error>();
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const activateReadySession = useCallback(
    async (
      runtime: FirebaseRuntime,
      ready: ReadyFirebaseSession,
      isAllowed: () => boolean = () => true,
    ) => {
      const sessionToken = sessionStore.begin();
      const saved = await sessionStore.save(sessionToken, ready);
      if (!saved || !mounted.current || !isAllowed()) {
        return;
      }

      const container = await runtime.createCareContainer(ready, {
        onRevoked: reason => {
          const message =
            reason === 'membership_removed'
              ? strings.app.membershipRemovedNotice
              : strings.app.accountChangedNotice;
          sessionStore
            .clear(sessionToken)
            .then(cleared => {
              if (!cleared || !mounted.current) {
                return;
              }
              setRuntimeError(undefined);
              setState({kind: 'setup', runtime, notice: message});
            })
            .catch(error => {
              if (mounted.current) {
                setState({
                  kind: 'error',
                  error: userFacingError(
                    strings.app.clearRevokedFailed,
                    error,
                  ),
                });
              }
            });
        },
        onError: error => {
          if (mounted.current && sessionStore.isCurrent(sessionToken)) {
            setRuntimeError(
              userFacingError(strings.app.connectionStatusFailed, error),
            );
          }
        },
      });
      if (
        !mounted.current ||
        !isAllowed() ||
        !sessionStore.isCurrent(sessionToken)
      ) {
        await container.dispose();
        return;
      }
      setState({
        kind: 'active',
        runtime,
        ready,
        container,
        sessionToken,
      });
      runtime
        .refreshMemberships(ready)
        .then(async memberships => {
          const refreshed = {...ready, memberships};
          const refreshSaved = await sessionStore.save(
            sessionToken,
            refreshed,
          );
          if (!refreshSaved || !mounted.current || !isAllowed()) {
            return;
          }
          setState(current =>
            current.kind === 'active' &&
            current.container === container &&
            current.sessionToken === sessionToken
              ? {...current, ready: refreshed}
              : current,
          );
        })
        .catch(() => {
          // Cached memberships keep offline startup usable. The lifecycle's
          // server observer remains authoritative for revocation.
        });
    },
    [sessionStore, strings],
  );

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const runtime = await bootstrapFirebaseRuntime();
        if (!active) {
          return;
        }
        const pendingDeletion = await accountDeletionIntents.load();
        if (pendingDeletion) {
          const verified = await runtime.sessionServices.auth.verifyCurrentUser();
          if (!verified) {
            throw new Error(
              'Pending account deletion requires a verified current user',
            );
          }
          if (verified.userId !== pendingDeletion.userId) {
            throw new Error(
              'Pending account deletion belongs to a different user',
            );
          }
          await runtime.deleteAccount(pendingDeletion.userId);
          await AsyncStorage.clear();
          await runtime.sessionServices.auth.signOut();
          if (!active) {
            return;
          }
          setRuntimeError(undefined);
          setState({
            kind: 'setup',
            runtime,
            notice: strings.app.accountDeletedNotice,
          });
          return;
        }
        const identity = await runtime.sessionServices.auth.currentUser();
        if (identity) {
          try {
            const cached = await cache.load(identity.userId);
            if (cached) {
              await activateReadySession(runtime, cached, () => active);
              return;
            }
          } catch (error) {
            if (!(error instanceof CloudCareContextHydrationError)) {
              throw error;
            }
            setRuntimeError(
              userFacingError(strings.app.cacheRehydrated, error),
            );
          }
        }
        const restored = await restoreFirebaseSession(runtime.sessionServices);
        if (!active) {
          return;
        }
        if (restored.kind === 'ready') {
          await activateReadySession(runtime, restored, () => active);
        } else {
          setState({kind: 'setup', runtime});
        }
      } catch (error) {
        if (active) {
          setState({
            kind: 'error',
            error: userFacingError(strings.app.bootstrapFailed, error),
          });
        }
      }
    };

    bootstrap().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [
    accountDeletionIntents,
    activateReadySession,
    cache,
    retryKey,
    strings,
  ]);

  if (state.kind === 'loading') {
    return (
      <View style={[styles.loading, {backgroundColor: theme.colors.background}]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={[styles.loadingTitle, {color: theme.colors.text}]}>
          {strings.app.loadingTitle}
        </Text>
        <Text style={[styles.loadingText, {color: theme.colors.textMuted}]}>
          {strings.app.loadingText}
        </Text>
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={[styles.loading, {backgroundColor: theme.colors.background}]}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={[styles.loadingTitle, {color: theme.colors.text}]}>
          {strings.app.errorTitle}
        </Text>
        <Text style={[styles.errorDetail, {color: theme.colors.textMuted}]}>
          {state.error.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setState({kind: 'loading'});
            setRetryKey(value => value + 1);
          }}
          style={[styles.primaryButton, {backgroundColor: theme.colors.primary}]}>
          <Text style={styles.primaryButtonText}>{strings.common.retry}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.kind === 'setup') {
    return (
      <CloudOnboardingScreen
        initialErrorMessage={state.notice}
        onCreate={async input => {
          const ready = await createOwnerFirebaseSession(
            state.runtime.sessionServices,
            input,
          );
          await state.runtime.analytics?.track({
            name: 'bc_group_created',
            params: {},
          });
          await state.runtime.analytics?.track({
            name: 'bc_onboarding_complete',
            params: {mode: 'create'},
          });
          await activateReadySession(state.runtime, ready);
        }}
        onJoin={async input => {
          const ready = await joinFirebaseSession(
            state.runtime.sessionServices,
            input,
          );
          await state.runtime.analytics?.track({
            name: 'bc_invite_joined',
            params: {},
          });
          await state.runtime.analytics?.track({
            name: 'bc_onboarding_complete',
            params: {mode: 'join'},
          });
          await activateReadySession(state.runtime, ready);
        }}
        strings={strings}
        theme={theme}
      />
    );
  }

  return (
    <FirebaseCareDashboard
      container={state.container}
      invite={state.invite}
      onInvite={async () => {
        const invite = await state.runtime.createInvite(state.ready);
        await state.runtime.analytics?.track({
          name: 'bc_invite_created',
          params: {},
        });
        setState(current =>
          current.kind === 'active' && current.container === state.container
            ? {
                ...current,
                invite: {code: invite.code, expiresAt: invite.expiresAt},
              }
            : current,
        );
      }}
      onDeleteAccount={async () => {
        const deletedUserId = state.ready.context.identity.userId;
        await accountDeletionIntents.save({userId: deletedUserId});
        await state.runtime.deleteAccount(deletedUserId);
        state.container.stopSessionLifecycle();
        try {
          await state.container.purge();
          const cleared = await sessionStore.clear(state.sessionToken);
          if (!cleared) {
            throw new Error('Deleted account session cache is no longer current');
          }
          await accountDeletionIntents.clear();
        } catch {
          await AsyncStorage.clear();
        }
        await state.runtime.sessionServices.auth.signOut();
        setRuntimeError(undefined);
        setState({
          kind: 'setup',
          runtime: state.runtime,
          notice: strings.app.accountDeletedNotice,
        });
      }}
      onRefreshMembers={async () => {
        const memberships = await state.runtime.refreshMemberships(state.ready);
        const ready = {...state.ready, memberships};
        const saved = await sessionStore.save(state.sessionToken, ready);
        if (!saved) {
          return;
        }
        setState(current =>
          current.kind === 'active' &&
          current.container === state.container &&
          current.sessionToken === state.sessionToken
            ? {...current, ready}
            : current,
        );
      }}
      onRuntimeError={setRuntimeError}
      ready={state.ready}
      runtime={state.runtime}
      runtimeError={runtimeError}
      strings={strings}
    />
  );
}

const styles = StyleSheet.create({
  app: {flex: 1},
  screen: {flex: 1},
  loading: {alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28},
  loadingTitle: {fontSize: 20, fontWeight: '900', marginTop: 18, textAlign: 'center'},
  loadingText: {fontSize: 12, marginTop: 7, textAlign: 'center'},
  errorEmoji: {fontSize: 38},
  errorDetail: {fontSize: 13, lineHeight: 20, marginTop: 10, textAlign: 'center'},
  primaryButton: {alignItems: 'center', borderRadius: 14, justifyContent: 'center', marginTop: 24, minHeight: 50, paddingHorizontal: 30},
  primaryButtonText: {color: '#FFFFFF', fontSize: 14, fontWeight: '900'},
  runtimeError: {alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginHorizontal: 16, marginTop: 8, minHeight: 42, paddingHorizontal: 12, paddingVertical: 8},
  runtimeErrorText: {flex: 1, fontSize: 11, fontWeight: '700'},
  runtimeRetry: {fontSize: 11, fontWeight: '900', marginLeft: 10},
  toast: {alignSelf: 'center', borderRadius: 999, bottom: 78, paddingHorizontal: 18, paddingVertical: 11, position: 'absolute', zIndex: 10},
  toastText: {fontSize: 12, fontWeight: '800'},
});
