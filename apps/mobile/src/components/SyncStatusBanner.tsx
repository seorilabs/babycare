import {Pressable, StyleSheet, Text, View} from 'react-native';

import type {CareEventSyncState} from '@babycare/product-data';
import type {Strings} from '@babycare/product-ui';
import type {AppTheme} from '@babycare/product-ui';

export function SyncStatusBanner(props: {
  readonly states: readonly CareEventSyncState[];
  readonly onRetry: () => void;
  readonly onReapplyConflicts: () => void;
  readonly onDiscardConflicts: () => void;
  readonly strings: Strings;
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
    ? props.strings.sync.accessRevoked
    : conflicts > 0
      ? props.strings.sync.conflicts(conflicts)
      : failed.length > 0
        ? props.strings.sync.failed(failed.length)
        : props.strings.sync.pending(pending);
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
          accessibilityLabel={props.strings.sync.retryLabel}
          accessibilityRole="button"
          onPress={props.onRetry}
          style={styles.retry}>
          <Text style={[styles.retryText, {color: props.theme.colors.primary}]}>
            {props.strings.common.retry}
          </Text>
        </Pressable>
      ) : null}
      {conflicts > 0 ? (
        <View style={styles.conflictActions}>
          <Pressable
            accessibilityLabel={props.strings.sync.reapplyLabel}
            accessibilityRole="button"
            onPress={props.onReapplyConflicts}
            style={styles.retry}>
            <Text style={[styles.retryText, {color: props.theme.colors.primary}]}>
              {props.strings.sync.reapplyAction}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={props.strings.sync.discardLabel}
            accessibilityRole="button"
            onPress={props.onDiscardConflicts}
            style={styles.retry}>
            <Text style={[styles.retryText, {color: props.theme.colors.danger}]}>
              {props.strings.sync.discardAction}
            </Text>
          </Pressable>
        </View>
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
  conflictActions: {
    flexDirection: 'row',
  },
});
