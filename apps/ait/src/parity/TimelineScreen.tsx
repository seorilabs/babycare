import React, {useCallback, useMemo, useRef} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListData,
} from 'react-native';
import {
  compareCareEventNewestFirst,
  type CareEvent,
} from '../../../../packages/product-core/src/index.ts';

import {eventIcon, eventTitle, formatTimeAgo} from './format';
import type {Strings} from '@babycare/product-ui';
import type {LocalSession} from './session';
import type {AppTheme} from '@babycare/product-ui';

interface TimelineSectionMetadata {
  readonly key: string;
  readonly title: string;
}

type TimelineSection = SectionListData<CareEvent, TimelineSectionMetadata>;

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(timestamp: number, now: number, strings: Strings): string {
  const target = new Date(timestamp);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (dayKey(target.getTime()) === dayKey(today.getTime())) {
    return strings.timeline.today;
  }
  if (dayKey(target.getTime()) === dayKey(yesterday.getTime())) {
    return strings.timeline.yesterday;
  }
  return new Intl.DateTimeFormat(strings.intlLocale, {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(target);
}

function buildSections(
  events: readonly CareEvent[],
  now: number,
  strings: Strings,
): readonly TimelineSection[] {
  const groups = new Map<string, CareEvent[]>();
  for (const event of [...events].sort(compareCareEventNewestFirst)) {
    const key = dayKey(event.occurredAt);
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }
  return [...groups.entries()].map(([key, data]) => ({
    key,
    title: dayLabel(data[0]!.occurredAt, now, strings),
    data,
  }));
}

export function TimelineScreen(props: {
  readonly caregiverNames: ReadonlyMap<string, string>;
  readonly events: readonly CareEvent[];
  readonly now: number;
  readonly session: LocalSession;
  readonly strings: Strings;
  readonly theme: AppTheme;
  readonly hasMore: boolean;
  readonly capped: boolean;
  readonly loadingMore: boolean;
  readonly loadMoreError?: boolean;
  readonly onLoadMore: () => Promise<void>;
  readonly onRetryLoadMore: () => void | Promise<void>;
  readonly onEdit: (event: CareEvent) => void;
  readonly onDelete: (event: CareEvent) => Promise<void>;
}) {
  const {
    hasMore,
    loadMoreError,
    loadingMore,
    onDelete,
    onLoadMore,
    onRetryLoadMore,
  } = props;
  const strings = props.strings;
  const sections = useMemo(
    () => buildSections(props.events, props.now, strings),
    [props.events, props.now, strings],
  );
  const loadMoreInFlight = useRef(false);

  const confirmDelete = useCallback(
    (event: CareEvent) => {
      Alert.alert(
        strings.timeline.deleteConfirmTitle,
        eventTitle(event, strings),
        [
          {text: strings.common.cancel, style: 'cancel'},
          {
            text: strings.common.delete,
            style: 'destructive',
            onPress: () => onDelete(event).catch(() => undefined),
          },
        ],
      );
    },
    [onDelete, strings],
  );

  const runLoadMore = useCallback(
    async (retry: boolean) => {
      if (
        loadMoreInFlight.current ||
        loadingMore ||
        !hasMore ||
        (!retry && loadMoreError)
      ) {
        return;
      }
      loadMoreInFlight.current = true;
      try {
        if (retry) {
          await onRetryLoadMore();
        } else {
          await onLoadMore();
        }
      } catch {
        // The owner of paging state exposes the failure through loadMoreError.
      } finally {
        loadMoreInFlight.current = false;
      }
    },
    [
      hasMore,
      loadMoreError,
      loadingMore,
      onLoadMore,
      onRetryLoadMore,
    ],
  );

  const footerStatus = props.loadingMore ? (
    <View accessibilityLiveRegion="polite" style={styles.pageStatus}>
      <ActivityIndicator color={props.theme.colors.primary} size="small" />
      <Text style={[styles.pageStatusText, {color: props.theme.colors.textMuted}]}>
        {strings.timeline.loadingMore}
      </Text>
    </View>
  ) : props.loadMoreError ? (
    <View accessibilityLiveRegion="polite" style={styles.pageStatus}>
      <Text
        accessibilityRole="alert"
        style={[styles.pageError, {color: props.theme.colors.danger}]}>
        {strings.timeline.loadMoreError}
      </Text>
      <Pressable
        accessibilityLabel={strings.timeline.retryLoadMoreLabel}
        accessibilityRole="button"
        onPress={() => runLoadMore(true)}
        style={[styles.retryButton, {borderColor: props.theme.colors.primary}]}>
        <Text style={[styles.retryText, {color: props.theme.colors.primary}]}>
          {strings.common.retry}
        </Text>
      </Pressable>
    </View>
  ) : props.capped ? (
    <Text style={[styles.endText, {color: props.theme.colors.textMuted}]}>
      {strings.timeline.cappedEnd}
    </Text>
  ) : !props.hasMore && props.events.length > 0 ? (
    <Text style={[styles.endText, {color: props.theme.colors.textMuted}]}>
      {strings.timeline.allLoaded}
    </Text>
  ) : null;

  return (
    <SectionList<CareEvent, TimelineSectionMetadata>
      contentContainerStyle={styles.content}
      keyExtractor={event => event.id}
      ListEmptyComponent={
        <View style={[styles.empty, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={[styles.emptyTitle, {color: props.theme.colors.text}]}>
            {strings.timeline.emptyTitle}
          </Text>
          <Text style={[styles.emptyText, {color: props.theme.colors.textMuted}]}>
            {strings.timeline.emptyText}
          </Text>
        </View>
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <Text style={[styles.deleteHint, {color: props.theme.colors.textMuted}]}>
            {strings.timeline.deleteHint}
          </Text>
          {footerStatus}
        </View>
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, {color: props.theme.colors.text}]}>
              {strings.timeline.title}
            </Text>
            <Text style={[styles.subtitle, {color: props.theme.colors.textMuted}]}>
              {strings.timeline.subtitle}
            </Text>
          </View>
          <View style={[styles.liveBadge, {backgroundColor: props.theme.colors.primarySoft}]}>
            <Text style={[styles.liveText, {color: props.theme.colors.primary}]}>
              {props.session.runtimeMode === 'firebase'
                ? strings.timeline.liveShared
                : strings.timeline.liveLocal}
            </Text>
          </View>
        </View>
      }
      onEndReached={() => runLoadMore(false)}
      onEndReachedThreshold={0.25}
      renderItem={({item: event, index, section}) => {
        const last = index === section.data.length - 1;
        return (
          <Pressable
            accessibilityActions={[
              {name: 'activate', label: strings.timeline.editActionLabel},
              {name: 'longpress', label: strings.timeline.deleteActionLabel},
            ]}
            accessibilityHint={strings.timeline.editAccessibilityHint}
            accessibilityRole="button"
            onAccessibilityAction={accessibilityEvent => {
              if (accessibilityEvent.nativeEvent.actionName === 'activate') {
                props.onEdit(event);
              } else if (
                accessibilityEvent.nativeEvent.actionName === 'longpress'
              ) {
                confirmDelete(event);
              }
            }}
            onLongPress={() => confirmDelete(event)}
            onPress={() => props.onEdit(event)}
            style={[
              styles.row,
              {backgroundColor: props.theme.colors.surface},
              index === 0 && styles.firstRow,
              last
                ? styles.lastRow
                : {
                    borderBottomColor: props.theme.colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
            ]}>
            <View style={[styles.icon, {backgroundColor: props.theme.colors.surfaceMuted}]}>
              <Text style={styles.emoji}>{eventIcon(event)}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={[styles.eventTitle, {color: props.theme.colors.text}]}>
                {eventTitle(event, strings)}
              </Text>
              <Text style={[styles.meta, {color: props.theme.colors.textMuted}]}>
                {new Intl.DateTimeFormat(strings.intlLocale, {
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(event.occurredAt)}{' '}
                ·{' '}
                {props.caregiverNames.get(event.caregiverId) ??
                  strings.common.otherCaregiver}
              </Text>
              {event.note ? (
                <Text numberOfLines={2} style={[styles.note, {color: props.theme.colors.textMuted}]}>{event.note}</Text>
              ) : null}
            </View>
            <Text style={[styles.timeAgo, {color: props.theme.colors.textMuted}]}>
              {formatTimeAgo(event.occurredAt, props.now, strings)}
            </Text>
          </Pressable>
        );
      }}
      renderSectionHeader={({section}) => (
        <Text style={[styles.dayLabel, {color: props.theme.colors.textMuted}]}>
          {section.title}
        </Text>
      )}
      sections={sections}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      style={{backgroundColor: props.theme.colors.background}}
    />
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: 30, paddingHorizontal: 18, paddingTop: 14},
  header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24},
  title: {fontSize: 27, fontWeight: '900', letterSpacing: -0.7},
  subtitle: {fontSize: 12, marginTop: 5},
  liveBadge: {borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7},
  liveText: {fontSize: 10, fontWeight: '900', letterSpacing: 0.5},
  empty: {alignItems: 'center', borderRadius: 20, marginTop: 40, padding: 28},
  emptyIcon: {fontSize: 35},
  emptyTitle: {fontSize: 17, fontWeight: '800', marginTop: 13},
  emptyText: {fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: 'center'},
  dayLabel: {fontSize: 12, fontWeight: '800', marginBottom: 8, marginLeft: 4, marginTop: 2},
  row: {alignItems: 'flex-start', flexDirection: 'row', minHeight: 86, padding: 14},
  firstRow: {borderTopLeftRadius: 18, borderTopRightRadius: 18},
  lastRow: {borderBottomLeftRadius: 18, borderBottomRightRadius: 18, marginBottom: 20},
  icon: {alignItems: 'center', borderRadius: 13, height: 44, justifyContent: 'center', width: 44},
  emoji: {fontSize: 22},
  copy: {flex: 1, marginLeft: 12},
  eventTitle: {fontSize: 14, fontWeight: '800'},
  meta: {fontSize: 11, marginTop: 5},
  note: {fontSize: 11, lineHeight: 16, marginTop: 5},
  timeAgo: {fontSize: 10, marginLeft: 7, marginTop: 2},
  footer: {alignItems: 'center'},
  deleteHint: {fontSize: 10, marginTop: 3, textAlign: 'center'},
  pageStatus: {alignItems: 'center', marginTop: 16, minHeight: 58},
  pageStatusText: {fontSize: 11, marginTop: 8},
  pageError: {fontSize: 11, fontWeight: '700', textAlign: 'center'},
  retryButton: {borderRadius: 999, borderWidth: 1, marginTop: 9, paddingHorizontal: 15, paddingVertical: 8},
  retryText: {fontSize: 11, fontWeight: '800'},
  endText: {fontSize: 10, marginTop: 16, textAlign: 'center'},
});
