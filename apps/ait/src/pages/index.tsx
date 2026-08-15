import {createRoute} from '@granite-js/react-native';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, useColorScheme, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {ParityDashboard} from '../components/parity-dashboard';
import {CloudOnboardingScreen} from '../parity/CloudOnboardingScreen';
import {deviceAppLocale} from '../parity/locale';
import {createStrings} from '../parity/strings';
import {createTheme} from '../parity/theme';
import {
  bootstrapCareSession,
  createCareGroup,
  joinCareGroup,
  type ReadyCareSession,
} from '../services/babycare-backend';
import {babycareAnalytics} from '../services/analytics';

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
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState<ReadyCareSession>();
  const [error, setError] = useState('');

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReady(await bootstrapCareSession());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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
      initialErrorMessage={error || undefined}
      onCreate={async input => {
        const created = await createCareGroup(input);
        await babycareAnalytics.track({name: 'bc_group_created', params: {}});
        await babycareAnalytics.track({name: 'bc_onboarding_complete', params: {mode: 'create'}});
        setReady(created);
      }}
      onJoin={async input => {
        const joined = await joinCareGroup(input);
        await babycareAnalytics.track({name: 'bc_invite_joined', params: {}});
        await babycareAnalytics.track({name: 'bc_onboarding_complete', params: {mode: 'join'}});
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
