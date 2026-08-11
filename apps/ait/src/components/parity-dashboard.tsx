import {Storage} from '@apps-in-toss/framework';
import React, {useEffect, useMemo, useState} from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import type {CareEvent, CareEventKind} from '../../../../packages/product-core/src/index.ts';
import type {CareEventSyncState} from '../../../../packages/product-data/src/index.ts';
import {deviceAppLocale} from '../parity/locale';
import {createStrings} from '../parity/strings';
import type {LocalSession} from '../parity/session';
import {createTheme} from '../parity/theme';
import {QuickRecordModal} from '../parity/QuickRecordModal';
import {SyncStatusBanner} from '../parity/SyncStatusBanner';
import {TabBar, type AppTab} from '../parity/TabBar';
import {HomeScreen} from '../parity/HomeScreen';
import {MoreScreen} from '../parity/MoreScreen';
import {StatsScreen} from '../parity/StatsScreen';
import {TimelineScreen} from '../parity/TimelineScreen';

import {
  createInviteCode,
  deleteCareAccount,
  reloadCareSession,
  type ReadyCareSession,
} from '../services/babycare-backend';
import {
  createAitCareEventRuntime,
  type AitCareEventRuntime,
} from '../services/care-event-runtime';
import {babycareAnalytics} from '../services/analytics';
import {appsInTossRewardedAd} from '../services/rewarded-ad';

export function ParityDashboard({
  initialReady,
  onDeleted,
}: {
  readonly initialReady: ReadyCareSession;
  readonly onDeleted: () => void;
}) {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => createTheme(dark), [dark]);
  const strings = useMemo(() => createStrings(deviceAppLocale()), []);
  const [ready, setReady] = useState(initialReady);
  const [runtime, setRuntime] = useState<AitCareEventRuntime>();
  const [tab, setTab] = useState<AppTab>('home');
  const [recording, setRecording] = useState<CareEventKind>();
  const [syncStates, setSyncStates] = useState<readonly CareEventSyncState[]>([]);
  const [runtimeError, setRuntimeError] = useState<string>();
  const [savedMessage, setSavedMessage] = useState<string>();
  const [invite, setInvite] = useState<{
    readonly code: string;
    readonly expiresAt: number;
  }>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    let created: AitCareEventRuntime | undefined;
    let stopEvents: () => void = () => undefined;
    let stopSync: () => void = () => undefined;
    createAitCareEventRuntime(initialReady, error => {
      if (active) {
        setRuntimeError(error.message);
      }
    })
      .then(value => {
        if (!active) {
          return value.close();
        }
        created = value;
        setRuntime(value);
        stopEvents = value.observe(events => {
          setReady(current => ({...current, events}));
          setNow(Date.now());
        });
        stopSync = value.observeSyncState(setSyncStates);
        return value.syncNow();
      })
      .catch(error => {
        if (active) {
          setRuntimeError(
            error instanceof Error
              ? error.message
              : '공동 기록을 준비하지 못했어요.',
          );
        }
      });
    return () => {
      active = false;
      stopEvents();
      stopSync();
      void created?.close();
    };
  }, [initialReady]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!runtime) {
      return undefined;
    }
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runtime.syncNow().catch(error =>
          setRuntimeError(
            error instanceof Error ? error.message : strings.app.syncRetryFailed,
          ),
        );
      }
    });
    return () => subscription.remove();
  }, [runtime, strings]);

  useEffect(() => {
    if (!savedMessage) {
      return undefined;
    }
    const timer = setTimeout(() => setSavedMessage(undefined), 1_800);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  useEffect(() => {
    void babycareAnalytics.track({
      name: 'core_screen_view',
      params: {screen_name: tab, screen_class: 'AitParityDashboard'},
    });
  }, [tab]);

  const caregiverNames = useMemo(
    () =>
      new Map(
        ready.memberships.map(membership => [
          membership.userId,
          membership.displayName,
        ]),
      ),
    [ready.memberships],
  );
  const session = useMemo<LocalSession>(
    () => ({
      groupId: ready.group.id,
      babyId: ready.baby.id,
      caregiverId: ready.uid,
      caregiverName: ready.membership.displayName,
      babyName: ready.baby.name,
      birthDate: ready.baby.birthDate,
      inviteCode: invite?.code ?? '',
      runtimeMode: 'firebase',
      membershipRole: ready.membership.membershipRole,
    }),
    [invite?.code, ready],
  );
  const activeSleep = ready.events.find(
    (event): event is CareEvent & {readonly kind: 'sleep'} =>
      event.kind === 'sleep' &&
      event.endedAt === undefined &&
      event.deletedAt === undefined,
  );

  const reportError = (error: unknown, fallback: string) => {
    setRuntimeError(error instanceof Error ? error.message : fallback);
  };

  const renderTab = () => {
    if (tab === 'timeline') {
      return (
        <TimelineScreen
          capped={ready.events.length >= 1_000}
          caregiverNames={caregiverNames}
          events={ready.events}
          hasMore={false}
          loadingMore={false}
          now={now}
          onDelete={async event => {
            if (!runtime) {
              throw new Error('동기화를 준비하고 있어요.');
            }
            await runtime.softDelete(event);
            setSavedMessage(strings.app.eventDeleted);
          }}
          onLoadMore={async () => undefined}
          onRetryLoadMore={async () => undefined}
          session={session}
          strings={strings}
          theme={theme}
        />
      );
    }
    if (tab === 'stats') {
      return (
        <StatsScreen
          analytics={babycareAnalytics}
          events={ready.events}
          now={now}
          rewardedAd={appsInTossRewardedAd}
          storage={Storage}
          strings={strings}
          theme={theme}
        />
      );
    }
    if (tab === 'more') {
      return (
        <MoreScreen
          inviteExpiresAt={invite?.expiresAt}
          memberships={ready.memberships}
          onCreateInvite={async () => {
            const created = await createInviteCode(ready);
            setInvite({code: created.code, expiresAt: created.expiresAt});
          }}
          onDeleteAccount={async () => {
            await deleteCareAccount(ready);
            await runtime?.purge();
            onDeleted();
          }}
          onRefreshMembers={async () => {
            const latest = await reloadCareSession(ready);
            setReady(current => ({...latest, events: current.events}));
            await runtime?.syncNow();
          }}
          onReset={async () => undefined}
          session={session}
          strings={strings}
          theme={theme}
        />
      );
    }
    return (
      <HomeScreen
        activeSleep={activeSleep}
        caregiverNames={caregiverNames}
        events={ready.events}
        now={now}
        onMore={() => setTab('more')}
        onRecord={kind => {
          if (runtime) {
            setRecording(kind);
          }
        }}
        onStopSleep={async event => {
          if (!runtime) {
            throw new Error('동기화를 준비하고 있어요.');
          }
          await runtime.endSleep(event);
          setSavedMessage(strings.app.sleepRecorded);
        }}
        session={session}
        strings={strings}
        theme={theme}
      />
    );
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      {runtimeError ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.error,
            {backgroundColor: theme.colors.surface, borderColor: theme.colors.danger},
          ]}>
          <Text style={[styles.errorText, {color: theme.colors.danger}]}>
            {runtimeError}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setRuntimeError(undefined);
              runtime
                ?.syncNow()
                .catch(error => reportError(error, strings.app.syncRetryFailed));
            }}>
            <Text style={[styles.retry, {color: theme.colors.primary}]}>
              {strings.common.retry}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <SyncStatusBanner
        onRetry={() =>
          runtime
            ?.syncNow()
            .catch(error => reportError(error, strings.app.syncRetryFailed))
        }
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
      <TabBar active={tab} onChange={setTab} strings={strings} theme={theme} />
      <QuickRecordModal
        events={ready.events}
        kind={recording}
        onClose={() => setRecording(undefined)}
        onSave={async input => {
          if (!runtime) {
            throw new Error('동기화를 준비하고 있어요.');
          }
          await runtime.record(input);
          setNow(Date.now());
          setSavedMessage(strings.app.eventSaved);
        }}
        session={session}
        strings={strings}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  screen: {flex: 1},
  error: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {flex: 1, fontSize: 12, fontWeight: '700'},
  retry: {fontSize: 12, fontWeight: '800', marginLeft: 12},
  toast: {
    alignSelf: 'center',
    borderRadius: 999,
    bottom: 78,
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'absolute',
  },
  toastText: {fontSize: 12, fontWeight: '800'},
});
