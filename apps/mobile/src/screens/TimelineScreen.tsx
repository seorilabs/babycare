import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {CareEvent} from '@babycare/product-core';

import {eventIcon, eventTitle, formatTimeAgo} from '../app/format';
import type {LocalSession} from '../app/session';
import type {AppTheme} from '../app/theme';

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(timestamp: number, now: number): string {
  const target = new Date(timestamp);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (dayKey(target.getTime()) === dayKey(today.getTime())) {
    return '오늘';
  }
  if (dayKey(target.getTime()) === dayKey(yesterday.getTime())) {
    return '어제';
  }
  return new Intl.DateTimeFormat('ko-KR', {month: 'long', day: 'numeric', weekday: 'short'}).format(target);
}

export function TimelineScreen(props: {
  readonly caregiverNames: ReadonlyMap<string, string>;
  readonly events: readonly CareEvent[];
  readonly now: number;
  readonly session: LocalSession;
  readonly theme: AppTheme;
  readonly onDelete: (event: CareEvent) => Promise<void>;
}) {
  const groups = new Map<string, CareEvent[]>();
  for (const event of props.events) {
    const key = dayKey(event.occurredAt);
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={{backgroundColor: props.theme.colors.background}}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, {color: props.theme.colors.text}]}>타임라인</Text>
          <Text style={[styles.subtitle, {color: props.theme.colors.textMuted}]}>누가 무엇을 기록했는지 시간순으로 확인해요</Text>
        </View>
        <View style={[styles.liveBadge, {backgroundColor: props.theme.colors.primarySoft}]}>
          <Text style={[styles.liveText, {color: props.theme.colors.primary}]}>● LOCAL</Text>
        </View>
      </View>

      {props.events.length === 0 ? (
        <View style={[styles.empty, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={[styles.emptyTitle, {color: props.theme.colors.text}]}>첫 돌봄 기록을 남겨보세요</Text>
          <Text style={[styles.emptyText, {color: props.theme.colors.textMuted}]}>홈의 큰 버튼으로 수유·기저귀·수면을 빠르게 기록할 수 있어요.</Text>
        </View>
      ) : (
        [...groups.values()].map(events => (
          <View key={dayKey(events[0]!.occurredAt)} style={styles.day}>
            <Text style={[styles.dayLabel, {color: props.theme.colors.textMuted}]}>
              {dayLabel(events[0]!.occurredAt, props.now)}
            </Text>
            <View style={[styles.list, {backgroundColor: props.theme.colors.surface}]}>
              {events.map((event, index) => {
                const canDelete = event.caregiverId === props.session.caregiverId;
                return (
                  <Pressable
                  accessibilityHint={canDelete ? '길게 누르면 기록을 삭제할 수 있습니다' : undefined}
                  key={event.id}
                  onLongPress={
                    canDelete
                      ? () =>
                          Alert.alert('기록을 삭제할까요?', eventTitle(event), [
                            {text: '취소', style: 'cancel'},
                            {
                              text: '삭제',
                              style: 'destructive',
                              onPress: () => props.onDelete(event).catch(() => undefined),
                            },
                          ])
                      : undefined
                  }
                  style={[
                    styles.row,
                    index < events.length - 1 && {
                      borderBottomColor: props.theme.colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <View style={[styles.icon, {backgroundColor: props.theme.colors.surfaceMuted}]}>
                    <Text style={styles.emoji}>{eventIcon(event)}</Text>
                  </View>
                  <View style={styles.copy}>
                    <Text style={[styles.eventTitle, {color: props.theme.colors.text}]}>{eventTitle(event)}</Text>
                    <Text style={[styles.meta, {color: props.theme.colors.textMuted}]}>
                      {new Intl.DateTimeFormat('ko-KR', {hour: 'numeric', minute: '2-digit'}).format(event.occurredAt)} ·{' '}
                      {props.caregiverNames.get(event.caregiverId) ?? '다른 양육자'}
                    </Text>
                    {event.note ? (
                      <Text numberOfLines={2} style={[styles.note, {color: props.theme.colors.textMuted}]}>{event.note}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.timeAgo, {color: props.theme.colors.textMuted}]}>{formatTimeAgo(event.occurredAt, props.now)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}
      <Text style={[styles.deleteHint, {color: props.theme.colors.textMuted}]}>내 기록을 길게 누르면 삭제할 수 있어요.</Text>
    </ScrollView>
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
  day: {marginBottom: 20},
  dayLabel: {fontSize: 12, fontWeight: '800', marginBottom: 8, marginLeft: 4},
  list: {borderRadius: 18, overflow: 'hidden'},
  row: {alignItems: 'flex-start', flexDirection: 'row', minHeight: 86, padding: 14},
  icon: {alignItems: 'center', borderRadius: 13, height: 44, justifyContent: 'center', width: 44},
  emoji: {fontSize: 22},
  copy: {flex: 1, marginLeft: 12},
  eventTitle: {fontSize: 14, fontWeight: '800'},
  meta: {fontSize: 11, marginTop: 5},
  note: {fontSize: 11, lineHeight: 16, marginTop: 5},
  timeAgo: {fontSize: 10, marginLeft: 7, marginTop: 2},
  deleteHint: {fontSize: 10, marginTop: 3, textAlign: 'center'},
});
