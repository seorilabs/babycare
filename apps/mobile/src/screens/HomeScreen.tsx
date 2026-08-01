import {useMemo, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  buildDashboardSummary,
  isActiveSleep,
  parseIsoCalendarDate,
  type CareEvent,
  type CareEventKind,
  type SleepEvent,
} from '@babycare/product-core';

import {eventTitle, formatDuration, formatTimeAgo} from '../app/format';
import type {LocalSession} from '../app/session';
import type {AppTheme} from '../app/theme';

function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfTomorrow(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function ageLabel(birthDate: string, now: number): string {
  const born = parseIsoCalendarDate(birthDate);
  if (born === undefined) {
    return '';
  }
  const today = new Date(now);
  const todayDay = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const days = Math.max(0, Math.floor((todayDay - born) / 86_400_000));
  return `생후 ${days}일`;
}

function LatestCard(props: {
  readonly kind: CareEventKind;
  readonly event: CareEvent | undefined;
  readonly now: number;
  readonly caregiverNames: ReadonlyMap<string, string>;
  readonly theme: AppTheme;
}) {
  const config = {
    feeding: {icon: '🍼', label: '마지막 수유', color: props.theme.colors.feeding},
    diaper: {icon: '🧷', label: '마지막 기저귀', color: props.theme.colors.diaper},
    sleep: {icon: '🌙', label: '마지막 수면', color: props.theme.colors.sleep},
  }[props.kind];

  return (
    <View
      style={[
        styles.latestCard,
        {backgroundColor: props.theme.colors.surface, borderColor: props.theme.colors.border},
      ]}>
      <View style={[styles.latestIcon, {backgroundColor: `${config.color}1F`}]}>
        <Text style={styles.latestEmoji}>{config.icon}</Text>
      </View>
      <View style={styles.latestCopy}>
        <Text style={[styles.latestLabel, {color: props.theme.colors.textMuted}]}>{config.label}</Text>
        <Text style={[styles.latestTitle, {color: props.theme.colors.text}]} numberOfLines={1}>
          {props.event ? eventTitle(props.event) : '아직 기록이 없어요'}
        </Text>
        {props.event ? (
          <Text style={[styles.latestMeta, {color: props.theme.colors.textMuted}]}>
            {props.caregiverNames.get(props.event.caregiverId) ?? '다른 양육자'} ·{' '}
            {formatTimeAgo(props.event.occurredAt, props.now)}
          </Text>
        ) : null}
      </View>
      {props.event ? (
        <Text style={[styles.elapsed, {color: config.color}]}>
          {isActiveSleep(props.event) ? '자는 중' : formatTimeAgo(props.event.occurredAt, props.now)}
        </Text>
      ) : null}
    </View>
  );
}

export function HomeScreen(props: {
  /** Authoritative active-sleep projection; do not infer it from a bounded timeline. */
  readonly activeSleep: SleepEvent | undefined;
  readonly caregiverNames: ReadonlyMap<string, string>;
  readonly events: readonly CareEvent[];
  readonly session: LocalSession;
  readonly now: number;
  readonly theme: AppTheme;
  readonly onRecord: (kind: CareEventKind) => void;
  readonly onMore: () => void;
  readonly onStopSleep: (event: CareEvent) => Promise<void>;
}) {
  const summary = useMemo(
    () =>
      buildDashboardSummary(
        props.events,
        {from: startOfToday(props.now), to: startOfTomorrow(props.now)},
        props.now,
      ),
    [props.events, props.now],
  );
  const activeSleep = props.activeSleep;
  const sleepStopInFlight = useRef(false);
  const [stoppingSleep, setStoppingSleep] = useState(false);
  const today = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(props.now);

  const stopSleep = async (event: CareEvent) => {
    if (sleepStopInFlight.current) {
      return;
    }
    sleepStopInFlight.current = true;
    setStoppingSleep(true);
    try {
      await props.onStopSleep(event);
    } finally {
      sleepStopInFlight.current = false;
      setStoppingSleep(false);
    }
  };

  const quickActions: ReadonlyArray<{
    readonly kind: CareEventKind | 'more';
    readonly icon: string;
    readonly label: string;
    readonly color: string;
    readonly hint: string;
  }> = [
    {
      kind: 'feeding',
      icon: '🍼',
      label: '수유',
      color: props.theme.colors.feeding,
      hint: '바로 남기기',
    },
    {
      kind: 'diaper',
      icon: '🧷',
      label: '기저귀',
      color: props.theme.colors.diaper,
      hint: '바로 남기기',
    },
    {
      kind: 'sleep',
      icon: activeSleep ? '☀️' : '🌙',
      label: activeSleep ? (stoppingSleep ? '종료 중…' : '기상') : '수면',
      color: props.theme.colors.sleep,
      hint: activeSleep
        ? stoppingSleep
          ? '잠시만 기다려주세요'
          : '지금 종료'
        : '바로 남기기',
    },
    {
      kind: 'more',
      icon: '＋',
      label: '더보기',
      color: props.theme.colors.primary,
      hint: '설정 열기',
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={{backgroundColor: props.theme.colors.background}}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.babyName, {color: props.theme.colors.text}]}>
            {props.session.babyName}
          </Text>
          <Text style={[styles.date, {color: props.theme.colors.textMuted}]}>
            {today} · {ageLabel(props.session.birthDate, props.now)}
          </Text>
        </View>
        <View style={[styles.syncBadge, {backgroundColor: props.theme.colors.primarySoft}]}>
          <View style={[styles.syncDot, {backgroundColor: props.theme.colors.primary}]} />
          <Text style={[styles.syncText, {color: props.theme.colors.primary}]}>
            {props.session.runtimeMode === 'firebase' ? '공동 기록' : '로컬 저장'}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionEyebrow, {color: props.theme.colors.textMuted}]}>최근 돌봄</Text>
      <View style={styles.latestList}>
        <LatestCard
          caregiverNames={props.caregiverNames}
          event={summary.latest.feeding}
          kind="feeding"
          now={props.now}
          theme={props.theme}
        />
        <LatestCard
          caregiverNames={props.caregiverNames}
          event={summary.latest.diaper}
          kind="diaper"
          now={props.now}
          theme={props.theme}
        />
        <LatestCard
          caregiverNames={props.caregiverNames}
          event={activeSleep ?? summary.latest.sleep}
          kind="sleep"
          now={props.now}
          theme={props.theme}
        />
      </View>

      <View style={[styles.summary, {backgroundColor: props.theme.colors.surface}]}>
        <View style={styles.summaryHeader}>
          <Text style={[styles.summaryTitle, {color: props.theme.colors.text}]}>오늘 요약</Text>
          <Text style={[styles.summaryHint, {color: props.theme.colors.textMuted}]}>자정부터 지금까지</Text>
        </View>
        <View style={styles.summaryItems}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, {color: props.theme.colors.feeding}]}>{summary.feedingCount}</Text>
            <Text style={[styles.summaryLabel, {color: props.theme.colors.textMuted}]}>수유</Text>
          </View>
          <View style={[styles.summaryDivider, {backgroundColor: props.theme.colors.border}]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, {color: props.theme.colors.diaper}]}>{summary.diaperCount}</Text>
            <Text style={[styles.summaryLabel, {color: props.theme.colors.textMuted}]}>기저귀</Text>
          </View>
          <View style={[styles.summaryDivider, {backgroundColor: props.theme.colors.border}]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, {color: props.theme.colors.sleep}]}>
              {formatDuration(summary.sleepDurationSeconds)}
            </Text>
            <Text style={[styles.summaryLabel, {color: props.theme.colors.textMuted}]}>수면</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, {color: props.theme.colors.text}]}>빠른 기록</Text>
      <View style={styles.actions}>
        {quickActions.map(action => (
          <Pressable
            accessibilityLabel={
              action.kind === 'sleep' && activeSleep
                ? stoppingSleep
                  ? '수면 종료 중'
                  : '수면 종료'
                : undefined
            }
            accessibilityRole="button"
            accessibilityState={
              action.kind === 'sleep' && activeSleep
                ? {busy: stoppingSleep, disabled: stoppingSleep}
                : undefined
            }
            disabled={
              action.kind === 'sleep' && Boolean(activeSleep) && stoppingSleep
            }
            key={action.kind}
            onPress={() => {
              if (action.kind === 'more') {
                props.onMore();
              } else if (action.kind === 'sleep' && activeSleep) {
                stopSleep(activeSleep).catch(() => undefined);
              } else {
                props.onRecord(action.kind);
              }
            }}
            style={({pressed}) => [
              styles.action,
              {
                backgroundColor: props.theme.colors.surface,
                borderColor: props.theme.colors.border,
                opacity:
                  action.kind === 'sleep' && activeSleep && stoppingSleep
                    ? 0.65
                    : pressed
                      ? 0.75
                      : 1,
              },
            ]}>
            <View style={[styles.actionIcon, {backgroundColor: `${action.color}20`}]}>
              <Text style={styles.actionEmoji}>{action.icon}</Text>
            </View>
            <Text style={[styles.actionLabel, {color: props.theme.colors.text}]}>{action.label}</Text>
            <Text style={[styles.actionHint, {color: props.theme.colors.textMuted}]}>
              {action.hint}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: 28, paddingHorizontal: 18, paddingTop: 12},
  header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26},
  babyName: {fontSize: 25, fontWeight: '800', letterSpacing: -0.7},
  date: {fontSize: 13, marginTop: 5},
  syncBadge: {alignItems: 'center', borderRadius: 999, flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7},
  syncDot: {borderRadius: 4, height: 7, marginRight: 6, width: 7},
  syncText: {fontSize: 11, fontWeight: '700'},
  sectionEyebrow: {fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 9, textTransform: 'uppercase'},
  latestList: {gap: 9},
  latestCard: {alignItems: 'center', borderRadius: 17, borderWidth: 1, flexDirection: 'row', minHeight: 88, padding: 13},
  latestIcon: {alignItems: 'center', borderRadius: 14, height: 48, justifyContent: 'center', width: 48},
  latestEmoji: {fontSize: 24},
  latestCopy: {flex: 1, marginLeft: 12},
  latestLabel: {fontSize: 11, fontWeight: '600'},
  latestTitle: {fontSize: 15, fontWeight: '800', marginTop: 3},
  latestMeta: {fontSize: 11, marginTop: 4},
  elapsed: {fontSize: 11, fontWeight: '800', marginLeft: 8},
  summary: {borderRadius: 18, marginTop: 17, padding: 17},
  summaryHeader: {alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between'},
  summaryTitle: {fontSize: 16, fontWeight: '800'},
  summaryHint: {fontSize: 10},
  summaryItems: {alignItems: 'center', flexDirection: 'row', marginTop: 17},
  summaryItem: {alignItems: 'center', flex: 1},
  summaryValue: {fontSize: 19, fontWeight: '900'},
  summaryLabel: {fontSize: 11, marginTop: 4},
  summaryDivider: {height: 30, width: StyleSheet.hairlineWidth},
  sectionTitle: {fontSize: 18, fontWeight: '800', marginBottom: 11, marginTop: 25},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  action: {borderRadius: 18, borderWidth: 1, flexBasis: '47%', flexGrow: 1, minHeight: 135, padding: 15},
  actionIcon: {alignItems: 'center', borderRadius: 13, height: 44, justifyContent: 'center', width: 44},
  actionEmoji: {fontSize: 23},
  actionLabel: {fontSize: 16, fontWeight: '800', marginTop: 12},
  actionHint: {fontSize: 11, marginTop: 4},
});
