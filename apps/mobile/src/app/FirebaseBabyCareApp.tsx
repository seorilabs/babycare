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

function errorValue(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function userFacingError(message: string, cause: unknown): Error {
  const error = new Error(message);
  Object.defineProperty(error, 'cause', {value: cause});
  return error;
}

function FirebaseCareDashboard(props: {
  readonly runtime: FirebaseRuntime;
  readonly ready: ReadyFirebaseSession;
  readonly container: CareContainer;
  readonly invite?: {readonly code: string; readonly expiresAt: number};
  readonly onInvite: () => Promise<void>;
  readonly onRefreshMembers: () => Promise<void>;
  readonly onRuntimeError: (error: Error | undefined) => void;
  readonly runtimeError?: Error;
}) {
  const {onRuntimeError} = props;
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
    if (!savedMessage) {
      return undefined;
    }
    const timeout = setTimeout(() => setSavedMessage(undefined), 1_800);
    return () => clearTimeout(timeout);
  }, [savedMessage]);

  useEffect(() => {
    if (overview.status === 'error' && overview.error) {
      onRuntimeError(
        errorValue(
          overview.error.cause,
          '공동 기록을 새로 불러오지 못했어요',
        ),
      );
    }
  }, [onRuntimeError, overview.error, overview.status]);

  const showError = (title: string, error: unknown) => {
    const value = errorValue(error, '잠시 후 다시 시도해 주세요.');
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
              setSavedMessage('기록을 삭제했어요');
            } catch (error) {
              showError('삭제할 수 없어요', error);
            }
          }}
          onLoadMore={() => props.container.timelineFeed.loadMore()}
          onRetryLoadMore={() => props.container.timelineFeed.retryLoadMore()}
          session={session}
          theme={theme}
        />
      );
    }
    if (tab === 'stats') {
      return <StatsScreen events={overview.events} now={now} theme={theme} />;
    }
    if (tab === 'more') {
      return (
        <MoreScreen
          inviteExpiresAt={props.invite?.expiresAt}
          memberships={props.ready.memberships}
          onCreateInvite={props.onInvite}
          onRefreshMembers={props.onRefreshMembers}
          onReset={async () => undefined}
          session={session}
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
            setSavedMessage('수면 시간을 기록했어요');
          } catch (error) {
            showError('수면을 종료할 수 없어요', error);
          }
        }}
        session={session}
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
                  errorValue(error, '공동 기록을 새로 불러오지 못했어요'),
                ),
              );
            }}>
            <Text style={[styles.runtimeRetry, {color: theme.colors.primary}]}>
              새로고침
            </Text>
          </Pressable>
        </View>
      ) : null}
      <SyncStatusBanner
        onRetry={() => {
          props.container.syncNow({retryFailed: true}).catch(error =>
            props.onRuntimeError(
              errorValue(error, '동기화를 다시 시도하지 못했어요'),
            ),
          );
        }}
        states={syncStates}
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
      <TabBar active={tab} onChange={setTab} theme={theme} />
      <QuickRecordModal
        kind={recording}
        onClose={() => setRecording(undefined)}
        onSave={async input => {
          try {
            await props.container.recordCareEvent(input);
            setNow(Date.now());
            setSavedMessage('돌봄 기록을 저장했어요');
          } catch (error) {
            showError('기록을 저장할 수 없어요', error);
            throw error;
          }
        }}
        session={session}
        theme={theme}
      />
    </SafeAreaView>
  );
}

export function FirebaseBabyCareApp() {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => createTheme(dark), [dark]);
  const cache = useMemo(() => new CloudCareContextCache(), []);
  const sessionStore = useMemo(
    () => new CloudCareContextSessionStore(cache),
    [cache],
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
              ? '돌봄 그룹 접근 권한이 해제됐어요'
              : '공동 기록 계정 상태가 변경됐어요';
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
                  error: errorValue(
                    error,
                    '해제된 공동 돌봄 정보를 기기에서 지우지 못했어요',
                  ),
                });
              }
            });
        },
        onError: error => {
          if (mounted.current && sessionStore.isCurrent(sessionToken)) {
            setRuntimeError(error);
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
    [sessionStore],
  );

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const runtime = await bootstrapFirebaseRuntime();
        if (!active) {
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
            setRuntimeError(error);
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
            error: userFacingError('공동 기록을 시작하지 못했어요', error),
          });
        }
      }
    };

    bootstrap().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activateReadySession, cache, retryKey]);

  if (state.kind === 'loading') {
    return (
      <View style={[styles.loading, {backgroundColor: theme.colors.background}]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={[styles.loadingTitle, {color: theme.colors.text}]}>
          공동 기록을 준비하고 있어요
        </Text>
        <Text style={[styles.loadingText, {color: theme.colors.textMuted}]}>
          계정과 돌봄 그룹을 확인합니다
        </Text>
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={[styles.loading, {backgroundColor: theme.colors.background}]}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={[styles.loadingTitle, {color: theme.colors.text}]}>
          공동 기록에 연결할 수 없어요
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
          <Text style={styles.primaryButtonText}>다시 시도</Text>
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
          await activateReadySession(state.runtime, ready);
        }}
        onJoin={async input => {
          const ready = await joinFirebaseSession(
            state.runtime.sessionServices,
            input,
          );
          await activateReadySession(state.runtime, ready);
        }}
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
        setState(current =>
          current.kind === 'active' && current.container === state.container
            ? {
                ...current,
                invite: {code: invite.code, expiresAt: invite.expiresAt},
              }
            : current,
        );
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
