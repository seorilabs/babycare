import {createRoute} from '@granite-js/react-native';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, AppState, StyleSheet, Text, useColorScheme, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  classifyBootFailure,
  classifyInviteJoinFailure,
} from '../../../../packages/product-core/src/index.ts';

import {ParityDashboard} from '../components/parity-dashboard';
import {ServiceIntroScreen} from '../components/service-intro-screen';
import {CloudOnboardingScreen} from '../parity/CloudOnboardingScreen';
import {deviceAppLocale} from '../services/device-locale';
import {createStrings, createTheme} from '@babycare/product-ui';
import {
  bootstrapCareSession,
  createCareGroup,
  joinCareGroup,
  type ReadyCareSession,
} from '../services/babycare-backend';
import {babycareAnalytics} from '../services/analytics';
import {flushAitAnalyticsOnAppState} from '../services/analytics-lifecycle';
import {
  handleAitPresenceAppState,
  prepareAitPresenceSession,
  stopAitPresence,
} from '../services/platform-presence';

export const Route = createRoute('/', {component: BabyNestHome});

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export function BabyNestHome() {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => createTheme(dark), [dark]);
  const strings = useMemo(() => createStrings(deviceAppLocale()), []);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<ReadyCareSession>();
  const [error, setError] = useState('');
  const bootStartedAt = useRef(Date.now());
  const bootScreenSent = useRef(false);
  const bootTerminalSent = useRef(false);

  const trackBootScreen = useCallback(() => {
    if (bootScreenSent.current) return;
    bootScreenSent.current = true;
    void babycareAnalytics
      .track({
        name: 'core_screen_view',
        params: {screen_name: 'boot', screen_class: 'BabyNestHome'},
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    handleAitPresenceAppState(AppState.currentState);
    const subscription = AppState.addEventListener('change', state => {
      handleAitPresenceAppState(state);
      flushAitAnalyticsOnAppState(babycareAnalytics, state);
    });
    return () => {
      subscription.remove();
      stopAitPresence();
    };
  }, []);

  const bootstrap = useCallback(async () => {
    trackBootScreen();
    setLoading(true);
    setError('');
    try {
      setReady(await bootstrapCareSession());
      prepareAitPresenceSession();
      if (!bootTerminalSent.current) {
        bootTerminalSent.current = true;
        await babycareAnalytics
          .track({
            name: 'bc_boot_ready',
            params: {stage_ms: Math.max(0, Date.now() - bootStartedAt.current)},
          })
          .catch(() => undefined);
      }
    } catch (caught) {
      if (!bootTerminalSent.current) {
        bootTerminalSent.current = true;
        await babycareAnalytics
          .track({
            name: 'core_screen_view',
            params: {screen_name: 'boot_error', screen_class: 'BabyNestHome'},
          })
          .catch(() => undefined);
        await babycareAnalytics
          .track({
            name: 'bc_boot_failed',
            params: {
              stage: 'session_restore',
              error_code: classifyBootFailure(caught),
            },
          })
          .catch(() => undefined);
      }
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [trackBootScreen]);

  if (!started) {
    return (
      <ServiceIntroScreen
        onStart={() => {
          bootStartedAt.current = Date.now();
          setStarted(true);
          void bootstrap();
        }}
        strings={strings}
        theme={theme}
      />
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, {backgroundColor: theme.colors.background}]} edges={['bottom']}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={[styles.loadingText, {color: theme.colors.textMuted}]}>
          {strings.app.loadingText}
        </Text>
      </SafeAreaView>
    );
  }

  if (ready) {
    return (
      <View
        testID="active-dashboard-frame"
        style={[styles.safeArea, {backgroundColor: theme.colors.background}]}>
        <ParityDashboard initialReady={ready} onDeleted={() => setReady(undefined)} />
      </View>
    );
  }

  return (
    <CloudOnboardingScreen
      analytics={babycareAnalytics}
      initialErrorMessage={error || undefined}
      onCreate={async input => {
        const created = await createCareGroup(input);
        await babycareAnalytics.track({name: 'bc_group_created', params: {}});
        await babycareAnalytics.track({name: 'bc_onboarding_complete', params: {mode: 'create'}});
        setReady(created);
      }}
      onJoin={async input => {
        await babycareAnalytics
          .track({name: 'bc_invite_join_attempt', params: {}})
          .catch(() => undefined);
        let joined: ReadyCareSession;
        try {
          joined = await joinCareGroup(input);
        } catch (caught) {
          await babycareAnalytics
            .track({
              name: 'bc_invite_join_failed',
              params: {reason_code: classifyInviteJoinFailure(caught)},
            })
            .catch(() => undefined);
          throw caught;
        }
        await babycareAnalytics
          .track({name: 'bc_invite_joined', params: {}})
          .catch(() => undefined);
        await babycareAnalytics
          .track({name: 'bc_onboarding_complete', params: {mode: 'join'}})
          .catch(() => undefined);
        setReady(joined);
      }}
      strings={strings}
      theme={theme}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1},
  centered: {alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center'},
  loadingText: {fontSize: 15},
});
