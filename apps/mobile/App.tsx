import {useEffect, useMemo, useRef, useState, type ComponentType} from 'react';
import {Alert, Pressable, StatusBar, StyleSheet, Text, useColorScheme, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {type CareEventKind} from '@babycare/product-core';

import {LocalSessionHydrationError} from './src/adapters/local/local-session-repository';
import {
  appContainer,
  selectVisibleCareEventOverview,
  type CareEventOverviewSnapshot,
} from './src/app/container';
import {createLocalSession, domainContext, type LocalSession} from './src/app/session';
import {createTheme} from './src/app/theme';
import {useLocalTimelinePagination} from './src/app/use-local-timeline-pagination';
import {QuickRecordModal} from './src/components/QuickRecordModal';
import {TabBar, type AppTab} from './src/components/TabBar';
import {HomeScreen} from './src/screens/HomeScreen';
import {MoreScreen} from './src/screens/MoreScreen';
import {OnboardingScreen} from './src/screens/OnboardingScreen';
import {StatsScreen} from './src/screens/StatsScreen';
import {TimelineScreen} from './src/screens/TimelineScreen';

function LoadingScreen({dark}: {readonly dark: boolean}) {
  const theme = createTheme(dark);
  return (
    <View style={[styles.loading, {backgroundColor: theme.colors.background}]}>
      <View style={[styles.loadingMark, {backgroundColor: theme.colors.primarySoft}]}>
        <Text style={styles.loadingEmoji}>🌿</Text>
      </View>
      <Text style={[styles.loadingTitle, {color: theme.colors.text}]}>함께 돌보는 오늘</Text>
      <Text style={[styles.loadingText, {color: theme.colors.textMuted}]}>양육 기록을 준비하고 있어요</Text>
    </View>
  );
}

function BabyCareApp() {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => createTheme(dark), [dark]);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<LocalSession>();
  const [overview, setOverview] = useState<CareEventOverviewSnapshot>({
    events: [],
    activeSleep: undefined,
  });
  const events = overview.events;
  const [tab, setTab] = useState<AppTab>('home');
  const [recording, setRecording] = useState<CareEventKind>();
  const [now, setNow] = useState(Date.now());
  const [savedMessage, setSavedMessage] = useState<string>();
  const locallyDeletedEventIds = useRef(new Set<string>());
  const localTimeline = useLocalTimelinePagination(
    events,
    session ? `${session.groupId}/${session.babyId}` : 'no-local-session',
  );

  useEffect(() => {
    appContainer.sessionRepository
      .load()
      .then(value => setSession(value))
      .catch(error => {
        setSession(undefined);
        if (error instanceof LocalSessionHydrationError) {
          Alert.alert(
            '로컬 정보를 복구할 수 없어요',
            `${error.message}. 로컬 정보를 지웠습니다. 돌봄 정보를 다시 입력해 주세요.`,
          );
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    locallyDeletedEventIds.current.clear();
    if (!session) {
      setOverview({events: [], activeSleep: undefined});
      return undefined;
    }
    const context = domainContext(session);
    let subscriptionActive = true;
    const stopOverview = appContainer.observeOverview(
      {groupId: context.groupId, babyId: context.babyId},
      snapshot => {
        if (!subscriptionActive) {
          return;
        }
        setOverview(
          selectVisibleCareEventOverview(
            snapshot,
            locallyDeletedEventIds.current,
          ),
        );
      },
    );
    return () => {
      if (!subscriptionActive) {
        return;
      }
      subscriptionActive = false;
      stopOverview();
    };
  }, [session]);

  useEffect(() => {
    if (!savedMessage) {
      return undefined;
    }
    const timeout = setTimeout(() => setSavedMessage(undefined), 1_800);
    return () => clearTimeout(timeout);
  }, [savedMessage]);

  if (!loaded) {
    return <LoadingScreen dark={dark} />;
  }

  if (!session) {
    return (
      <OnboardingScreen
        onComplete={async input => {
          const next = createLocalSession(input);
          await appContainer.sessionRepository.save(next);
          setSession(next);
        }}
        theme={theme}
      />
    );
  }

  const context = domainContext(session);
  const caregiverNames = new Map([[session.caregiverId, session.caregiverName]]);
  const renderTab = () => {
    if (tab === 'timeline') {
      return (
        <TimelineScreen
          capped={localTimeline.capped}
          events={localTimeline.events}
          caregiverNames={caregiverNames}
          hasMore={localTimeline.hasMore}
          loadingMore={localTimeline.loadingMore}
          loadMoreError={localTimeline.loadMoreError}
          now={now}
          onDelete={async event => {
            try {
              const deleted = await appContainer.softDeleteCareEvent({
                groupId: context.groupId,
                eventId: event.id,
                requestedBy: context.caregiverId,
              });
              locallyDeletedEventIds.current.add(deleted.id);
              setOverview(current => ({
                events: current.events.filter(item => item.id !== deleted.id),
                activeSleep: current.activeSleep,
              }));
              setSavedMessage('기록을 삭제했어요');
            } catch (error) {
              Alert.alert('삭제할 수 없어요', error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
            }
          }}
          onLoadMore={localTimeline.loadMore}
          onRetryLoadMore={localTimeline.retryLoadMore}
          session={session}
          theme={theme}
        />
      );
    }
    if (tab === 'stats') {
      return <StatsScreen events={events} now={now} theme={theme} />;
    }
    if (tab === 'more') {
      return (
        <MoreScreen
          onReset={async () => {
            await appContainer.repository.clear();
            await appContainer.sessionRepository.clear();
            locallyDeletedEventIds.current.clear();
            setSession(undefined);
            setOverview({events: [], activeSleep: undefined});
            setTab('home');
          }}
          session={session}
          theme={theme}
        />
      );
    }
    return (
      <HomeScreen
        activeSleep={overview.activeSleep}
        caregiverNames={caregiverNames}
        events={events}
        now={now}
        onMore={() => setTab('more')}
        onRecord={setRecording}
        onStopSleep={async event => {
          try {
            await appContainer.endSleepSession({groupId: context.groupId, eventId: event.id});
            setNow(Date.now());
            setSavedMessage('수면 시간을 기록했어요');
          } catch (error) {
            Alert.alert('수면을 종료할 수 없어요', error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
          }
        }}
        session={session}
        theme={theme}
      />
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.app, {backgroundColor: theme.colors.background}]}>
      <StatusBar backgroundColor={theme.colors.background} barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={styles.screen}>{renderTab()}</View>
      {savedMessage ? (
        <View style={[styles.toast, {backgroundColor: theme.colors.text}]}>
          <Text style={[styles.toastText, {color: theme.colors.background}]}>✓ {savedMessage}</Text>
        </View>
      ) : null}
      <TabBar active={tab} onChange={setTab} theme={theme} />
      <QuickRecordModal
        kind={recording}
        onClose={() => setRecording(undefined)}
        onSave={async input => {
          await appContainer.recordCareEvent(input);
          setNow(Date.now());
          setSavedMessage('돌봄 기록을 저장했어요');
        }}
        session={session}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function RuntimeApp() {
  const dark = useColorScheme() === 'dark';
  const [localPreview, setLocalPreview] = useState(
    () => typeof jest !== 'undefined',
  );
  const [FirebaseApp, setFirebaseApp] = useState<ComponentType<{
    readonly onUseLocalPreview: () => void;
  }>>();
  const [runtimeLoadError, setRuntimeLoadError] = useState<string>();

  useEffect(() => {
    if (localPreview || FirebaseApp) {
      return undefined;
    }
    let active = true;
    import('./src/app/FirebaseBabyCareApp')
      .then(module => {
        if (active) {
          setFirebaseApp(() => module.FirebaseBabyCareApp);
        }
      })
      .catch(error => {
        if (active) {
          setRuntimeLoadError(
            error instanceof Error
              ? error.message
              : 'Firebase 화면을 불러오지 못했어요',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [FirebaseApp, localPreview]);

  if (localPreview) {
    return <BabyCareApp />;
  }
  if (runtimeLoadError) {
    const theme = createTheme(dark);
    return (
      <View
        style={[styles.loading, {backgroundColor: theme.colors.background}]}>
        <Text style={[styles.loadingTitle, {color: theme.colors.text}]}>공동 기록 화면을 열 수 없어요</Text>
        <Text style={[styles.runtimeLoadError, {color: theme.colors.textMuted}]}>
          {runtimeLoadError}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setLocalPreview(true)}
          style={[styles.runtimeFallbackButton, {backgroundColor: theme.colors.primary}]}>
          <Text style={styles.runtimeFallbackText}>로컬 미리보기로 계속</Text>
        </Pressable>
      </View>
    );
  }
  if (!FirebaseApp) {
    return <LoadingScreen dark={dark} />;
  }
  return <FirebaseApp onUseLocalPreview={() => setLocalPreview(true)} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <RuntimeApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {flex: 1},
  screen: {flex: 1},
  loading: {alignItems: 'center', flex: 1, justifyContent: 'center'},
  loadingMark: {alignItems: 'center', borderRadius: 25, height: 74, justifyContent: 'center', width: 74},
  loadingEmoji: {fontSize: 38},
  loadingTitle: {fontSize: 24, fontWeight: '900', marginTop: 18},
  loadingText: {fontSize: 12, marginTop: 6},
  runtimeLoadError: {fontSize: 12, lineHeight: 18, marginTop: 10, paddingHorizontal: 28, textAlign: 'center'},
  runtimeFallbackButton: {borderRadius: 14, marginTop: 22, minHeight: 48, paddingHorizontal: 22, paddingVertical: 14},
  runtimeFallbackText: {color: '#FFFFFF', fontSize: 13, fontWeight: '900'},
  toast: {alignSelf: 'center', borderRadius: 999, bottom: 78, paddingHorizontal: 18, paddingVertical: 11, position: 'absolute', zIndex: 10},
  toastText: {fontSize: 12, fontWeight: '800'},
});
