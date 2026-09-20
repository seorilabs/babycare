import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  classifyInviteJoinFailure,
  classifyBootFailure,
  userId,
  type AnalyticsPort,
  type BootStage,
  type CareEvent,
  type CareEventKind,
} from '@babycare/product-core';
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
import {UpdateGateOverlay} from '../components/UpdateGateOverlay';
import {CloudOnboardingScreen} from '../screens/CloudOnboardingScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {MoreScreen} from '../screens/MoreScreen';
import {StatsScreen} from '../screens/StatsScreen';
import {TimelineScreen} from '../screens/TimelineScreen';
import {deviceAppLocale} from '../adapters/local/device-locale';
import {AccountDeletionIntentStore} from './account-deletion-intent-store';
import {flushMobileAnalyticsOnAppState} from './analytics-lifecycle';
import {createStrings, createTheme, type Strings} from '@babycare/product-ui';
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
import {
  handleMobilePresenceAppState,
  prepareMobilePresenceSession,
  stopMobilePresence,
} from './platform-presence';
import {checkMobileUpdateGate} from './platform-update-gate';
import type {UpdateGateState} from '../../../../packages/product-core/src/index.ts';

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

type ActiveRootState = Extract<RootState, {readonly kind: 'active'}>;

const EMPTY_TIMELINE: CareEventTimelineFeedState = {
  events: [],
  hasMore: true,
  loadingMore: false,
  loadMoreError: false,
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
  readonly onUpdateBabyProfile: (input: {
    readonly name: string;
    readonly birthDate: string;
  }) => Promise<void>;
  readonly onRemoveMember: (member: {
    readonly userId: string;
    readonly displayName: string;
  }) => Promise<void>;
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
  const [editingEvent, setEditingEvent] = useState<CareEvent>();
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
          onEdit={event => {
            setRecording(undefined);
            setEditingEvent(event);
          }}
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
          storage={AsyncStorage}
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
          onInviteShared={() => {
            props.runtime.analytics
              ?.track({name: 'bc_invite_shared', params: {}})
              .catch(() => undefined);
          }}
          onOpenAdPrivacyOptions={props.runtime.openAdPrivacyOptions}
          onRefreshMembers={props.onRefreshMembers}
          onUpdateBabyProfile={props.onUpdateBabyProfile}
          onRemoveMember={props.onRemoveMember}
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
        showFirstEntryGuide={
          overview.status === 'server_confirmed' &&
          overview.events.length === 0 &&
          overview.activeSleep === undefined
        }
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
        onDiscardConflicts={() => {
          props.container.repository.discardConflicts().catch(error =>
            props.onRuntimeError(
              userFacingError(strings.app.syncRetryFailed, error),
            ),
          );
        }}
        onReapplyConflicts={() => {
          props.container.repository.reapplyConflicts().catch(error =>
            props.onRuntimeError(
              userFacingError(strings.app.syncRetryFailed, error),
            ),
          );
        }}
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
        events={overview.events}
        historyStatus={
          overview.status === 'server_confirmed' ? 'complete' : 'partial'
        }
        initialEvent={editingEvent}
        kind={editingEvent?.kind ?? recording}
        onClose={() => {
          setEditingEvent(undefined);
          setRecording(undefined);
        }}
        onSave={async input => {
          if (editingEvent) {
            await props.container.updateCareEvent({
              groupId: props.ready.context.group.id,
              eventId: editingEvent.id,
              requestedBy: props.ready.context.identity.userId,
              update: input,
            });
          } else {
            await props.container.recordCareEvent(input);
          }
          if (
            input.kind === 'medication' &&
            overview.status !== 'server_confirmed'
          ) {
            await props.runtime.analytics
              ?.track({
                name: 'bc_medication_history_unconfirmed',
                params: {},
              })
              .catch(() => undefined);
          }
          setNow(Date.now());
          setSavedMessage(
            editingEvent ? strings.app.eventUpdated : strings.app.eventSaved,
          );
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
  const activeReadySession = useRef<ActiveRootState | undefined>(undefined);
  const readyOperationTail = useRef<Promise<void>>(Promise.resolve());
  const [state, setState] = useState<RootState>({kind: 'loading'});
  const [runtimeError, setRuntimeError] = useState<Error>();
  const [retryKey, setRetryKey] = useState(0);
  const [updateGate, setUpdateGate] = useState<UpdateGateState | null>(null);
  const bootStartedAt = useRef(Date.now());
  const bootStage = useRef<BootStage>('runtime');
  const bootAnalytics = useRef<AnalyticsPort | undefined>(undefined);
  const bootScreenSent = useRef(false);
  const bootTerminalSent = useRef(false);
  const setupAnalytics = state.kind === 'setup' ? state.runtime.analytics : undefined;

  const reportCacheWriteFailure = useCallback(
    (error: unknown) => {
      if (!mounted.current) {
        return;
      }
      const value = userFacingError(strings.app.cacheWriteFailedMessage, error);
      setRuntimeError(value);
      Alert.alert(strings.app.cacheWriteFailedTitle, value.message);
    },
    [strings],
  );

  const enqueueReadyOperation = useCallback(
    (
      expectedToken: CloudCareContextSessionToken,
      expectedContainer: CareContainer,
      operation: (current: ActiveRootState) => Promise<ReadyFirebaseSession>,
      onCacheWriteFailure?: (error: unknown) => void,
    ): Promise<void> => {
      const run = async () => {
        const current = activeReadySession.current;
        if (
          !mounted.current ||
          !current ||
          current.sessionToken !== expectedToken ||
          current.container !== expectedContainer ||
          !sessionStore.isCurrent(expectedToken)
        ) {
          return;
        }

        const ready = await operation(current);
        const latest = activeReadySession.current;
        if (
          !mounted.current ||
          !latest ||
          latest.sessionToken !== expectedToken ||
          latest.container !== expectedContainer ||
          !sessionStore.isCurrent(expectedToken)
        ) {
          return;
        }

        const next = {...latest, ready};
        activeReadySession.current = next;
        setState(stateValue =>
          stateValue.kind === 'active' &&
          stateValue.sessionToken === expectedToken &&
          stateValue.container === expectedContainer
            ? {...stateValue, ready}
            : stateValue,
        );

        try {
          await sessionStore.save(expectedToken, ready);
        } catch (error) {
          onCacheWriteFailure?.(error);
        }
      };
      const result = readyOperationTail.current.then(run, run);
      readyOperationTail.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [sessionStore],
  );

  const trackBootScreen = useCallback((analytics: AnalyticsPort) => {
    bootAnalytics.current = analytics;
    if (bootScreenSent.current) {
      return;
    }
    bootScreenSent.current = true;
    analytics
      .track({
        name: 'core_screen_view',
        params: {screen_name: 'boot', screen_class: 'FirebaseBabyCareApp'},
      })
      .catch(() => undefined);
  }, []);

  const trackBootReady = useCallback((analytics: AnalyticsPort) => {
    trackBootScreen(analytics);
    if (bootTerminalSent.current) {
      return;
    }
    bootTerminalSent.current = true;
    analytics
      .track({
        name: 'bc_boot_ready',
        params: {stage_ms: Math.max(0, Date.now() - bootStartedAt.current)},
      })
      .catch(() => undefined);
  }, [trackBootScreen]);

  useEffect(() => {
    mounted.current = true;
    handleMobilePresenceAppState(AppState.currentState);
    const subscription = AppState.addEventListener('change', nextState => {
      handleMobilePresenceAppState(nextState);
      flushMobileAnalyticsOnAppState(bootAnalytics.current, nextState);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      stopMobilePresence();
    };
  }, []);

  useEffect(() => {
    setupAnalytics
      ?.track({
        name: 'core_screen_view',
        params: {
          screen_name: 'onboarding',
          screen_class: 'CloudOnboardingScreen',
        },
      })
      .catch(() => undefined);
  }, [setupAnalytics]);

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
          if (activeReadySession.current?.sessionToken === sessionToken) {
            activeReadySession.current = undefined;
          }
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
      const activeState: ActiveRootState = {
        kind: 'active',
        runtime,
        ready,
        container,
        sessionToken,
      };
      activeReadySession.current = activeState;
      setState(activeState);
      trackBootReady(runtime.analytics);
      enqueueReadyOperation(
        sessionToken,
        container,
        async current => ({
          ...current.ready,
          memberships: await current.runtime.refreshMemberships(current.ready),
        }),
      )
        .catch(() => {
          // Cached memberships keep offline startup usable. The lifecycle's
          // server observer remains authoritative for revocation.
        });
    },
    [enqueueReadyOperation, sessionStore, strings, trackBootReady],
  );

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const runtime = await bootstrapFirebaseRuntime({
          onStage: stage => {
            bootStage.current = stage;
          },
          onAnalyticsReady: trackBootScreen,
        });
        trackBootScreen(runtime.analytics);
        prepareMobilePresenceSession(runtime.firebaseIdToken);
        void checkMobileUpdateGate().then(gate => {
          if (active) {
            setUpdateGate(gate);
          }
        });
        if (!active) {
          return;
        }
        bootStage.current = 'auth';
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
          trackBootReady(runtime.analytics);
          return;
        }
        const identity = await runtime.sessionServices.auth.currentUser();
        bootStage.current = 'session_restore';
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
          trackBootReady(runtime.analytics);
        }
      } catch (error) {
        if (active) {
          if (!bootTerminalSent.current && bootAnalytics.current) {
            bootTerminalSent.current = true;
            bootAnalytics.current
              .track({
                name: 'core_screen_view',
                params: {
                  screen_name: 'boot_error',
                  screen_class: 'FirebaseBabyCareApp',
                },
              })
              .catch(() => undefined);
            bootAnalytics.current
              .track({
                name: 'bc_boot_failed',
                params: {
                  stage: bootStage.current,
                  error_code: classifyBootFailure(error),
                },
              })
              .catch(() => undefined);
          }
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
    trackBootReady,
    trackBootScreen,
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
            bootStartedAt.current = Date.now();
            bootStage.current = 'runtime';
            bootScreenSent.current = false;
            bootTerminalSent.current = false;
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
      <>
      <CloudOnboardingScreen
        analytics={state.runtime.analytics}
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
          await state.runtime.analytics
            ?.track({name: 'bc_invite_join_attempt', params: {}})
            .catch(() => undefined);
          let ready: ReadyFirebaseSession;
          try {
            ready = await joinFirebaseSession(
              state.runtime.sessionServices,
              input,
            );
          } catch (error) {
            await state.runtime.analytics
              ?.track({
                name: 'bc_invite_join_failed',
                params: {reason_code: classifyInviteJoinFailure(error)},
              })
              .catch(() => undefined);
            throw error;
          }
          await state.runtime.analytics
            ?.track({name: 'bc_invite_joined', params: {}})
            .catch(() => undefined);
          await state.runtime.analytics
            ?.track({
              name: 'bc_onboarding_complete',
              params: {mode: 'join'},
            })
            .catch(() => undefined);
          await activateReadySession(state.runtime, ready);
        }}
        strings={strings}
        theme={theme}
      />
      <UpdateGateOverlay
        state={updateGate}
        onDismiss={() => setUpdateGate(null)}
        strings={strings}
      />
      </>
    );
  }

  return (
    <>
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
        await enqueueReadyOperation(
          state.sessionToken,
          state.container,
          async current => ({
            ...current.ready,
            memberships: await current.runtime.refreshMemberships(current.ready),
          }),
          reportCacheWriteFailure,
        );
      }}
      onUpdateBabyProfile={async input => {
        await enqueueReadyOperation(
          state.sessionToken,
          state.container,
          async current => ({
            ...current.ready,
            context: {
              ...current.ready.context,
              baby: await current.runtime.updateBabyProfile(
                current.ready,
                input,
              ),
            },
          }),
          reportCacheWriteFailure,
        );
      }}
      onRemoveMember={async member => {
        await enqueueReadyOperation(
          state.sessionToken,
          state.container,
          async current => {
            await current.runtime.removeMember(
              current.ready,
              userId(member.userId),
            );
            return {
              ...current.ready,
              memberships: await current.runtime.refreshMemberships(
                current.ready,
              ),
            };
          },
          reportCacheWriteFailure,
        );
      }}
      onRuntimeError={setRuntimeError}
      ready={state.ready}
      runtime={state.runtime}
      runtimeError={runtimeError}
      strings={strings}
    />
    <UpdateGateOverlay
      state={updateGate}
      onDismiss={() => setUpdateGate(null)}
      strings={strings}
    />
    </>
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
