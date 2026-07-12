import {Pressable, StyleSheet, Text, View} from 'react-native';

import type {CareEventSyncState} from '@babycare/product-data';
import type {AppTheme} from '../app/theme';

export function SyncStatusBanner(props: {
  readonly states: readonly CareEventSyncState[];
  readonly onRetry: () => void;
  readonly theme: AppTheme;
}) {
  const pending = props.states.filter(state => state.status === 'pending').length;
  const failed = props.states.filter(state => state.status === 'failed');
  const conflicts = failed.filter(
    state => state.failureKind === 'conflict',
  ).length;
  const revoked = failed.some(
    state =>
      state.failureKind === 'permission_denied' ||
      state.failureKind === 'unauthenticated',
  );
  const retryable = failed.filter(
    state => state.failureKind === 'retryable',
  ).length;

  if (pending === 0 && failed.length === 0) {
    return null;
  }

  const message = revoked
    ? '공동 기록 접근 권한을 확인해 주세요'
    : conflicts > 0
      ? `동기화 충돌 ${conflicts}건 · 서버 기록을 우선 표시해요`
      : failed.length > 0
        ? `동기화 실패 ${failed.length}건`
        : `동기화 대기 ${pending}건`;
  const danger = failed.length > 0;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: danger
            ? props.theme.colors.surface
            : props.theme.colors.primarySoft,
          borderColor: danger
            ? props.theme.colors.danger
            : props.theme.colors.primary,
        },
      ]}>
      <Text
        style={[
          styles.message,
          {
            color: danger
              ? props.theme.colors.danger
              : props.theme.colors.text,
          },
        ]}>
        {message}
      </Text>
      {retryable > 0 ? (
        <Pressable
          accessibilityLabel="동기화 다시 시도"
          accessibilityRole="button"
          onPress={props.onRetry}
          style={styles.retry}>
          <Text style={[styles.retryText, {color: props.theme.colors.primary}]}>
            다시 시도
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  message: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  retry: {
    marginLeft: 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
