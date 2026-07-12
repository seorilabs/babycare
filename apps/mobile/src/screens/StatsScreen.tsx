import {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  buildCareStatsBuckets,
  type CareEvent,
  type CareStatsBucket,
} from '@babycare/product-core';

import {formatDuration} from '../app/format';
import {buildStatsRanges, type StatsPeriod} from '../app/stats-ranges';
import type {AppTheme} from '../app/theme';

export type Period = StatsPeriod;
export {buildStatsRanges};

const EMPTY_SUMMARY = {
  latest: {},
  feedingCount: 0,
  feedingVolumeMl: 0,
  diaperCount: 0,
  sleepCount: 0,
  sleepDurationSeconds: 0,
} as const;

interface StatsBucket extends CareStatsBucket {
  readonly label: string;
}

export function buildStatsBuckets(
  events: readonly CareEvent[],
  now: number,
  period: Period,
): readonly StatsBucket[] {
  const ranges = buildStatsRanges(now, period);
  const positiveRanges = ranges.filter(range => range.to > range.from);
  const summaries = buildCareStatsBuckets(events, positiveRanges, now);
  let summaryIndex = 0;
  return ranges.map(range => {
    const summary =
      range.to > range.from
        ? summaries[summaryIndex++]!.summary
        : EMPTY_SUMMARY;
    return {
      ...range,
      summary,
      label:
        period === '12h'
          ? new Intl.DateTimeFormat('ko-KR', {hour: 'numeric'}).format(range.from)
          : new Intl.DateTimeFormat('ko-KR', {month: 'numeric', day: 'numeric'}).format(range.to - 1),
    };
  });
}

function BarChart(props: {
  readonly values: readonly number[];
  readonly labels: readonly string[];
  readonly color: string;
  readonly theme: AppTheme;
}) {
  const max = Math.max(1, ...props.values);
  return (
    <View style={styles.chart}>
      {props.values.map((value, index) => (
        <View key={`${props.labels[index]}-${index}`} style={styles.barColumn}>
          <Text style={[styles.barValue, {color: props.theme.colors.textMuted}]}>{value ? Math.round(value) : ''}</Text>
          <View style={[styles.barTrack, {backgroundColor: props.theme.colors.surfaceMuted}]}>
            <View
              style={[
                styles.bar,
                {backgroundColor: props.color, height: `${Math.max(value ? 12 : 0, (value / max) * 100)}%`},
              ]}
            />
          </View>
          <Text style={[styles.barLabel, {color: props.theme.colors.textMuted}]}>{props.labels[index]}</Text>
        </View>
      ))}
    </View>
  );
}

export function StatsScreen(props: {
  readonly events: readonly CareEvent[];
  readonly now: number;
  readonly theme: AppTheme;
}) {
  const [period, setPeriod] = useState<Period>('7d');
  const buckets = useMemo(
    () => buildStatsBuckets(props.events, props.now, period),
    [period, props.events, props.now],
  );
  const totals = useMemo(
    () => ({
      feeding: buckets.reduce((sum, bucket) => sum + bucket.summary.feedingCount, 0),
      volume: buckets.reduce((sum, bucket) => sum + bucket.summary.feedingVolumeMl, 0),
      diapers: buckets.reduce((sum, bucket) => sum + bucket.summary.diaperCount, 0),
      sleep: buckets.reduce((sum, bucket) => sum + bucket.summary.sleepDurationSeconds, 0),
    }),
    [buckets],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={{backgroundColor: props.theme.colors.background}}>
      <Text style={[styles.title, {color: props.theme.colors.text}]}>통계</Text>
      <Text style={[styles.subtitle, {color: props.theme.colors.textMuted}]}>돌봄 패턴을 참고용으로 확인해요</Text>
      <View style={[styles.periods, {backgroundColor: props.theme.colors.surfaceMuted}]}>
        {(['12h', '7d', '30d'] as const).map(value => (
          <Pressable
            key={value}
            onPress={() => setPeriod(value)}
            style={[
              styles.period,
              period === value && {backgroundColor: props.theme.colors.surface},
            ]}>
            <Text
              style={[
                styles.periodText,
                {color: period === value ? props.theme.colors.text : props.theme.colors.textMuted},
              ]}>
              {value === '12h' ? '12시간' : value === '7d' ? '7일' : '30일'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.overview}>
        <View style={[styles.metric, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={[styles.metricValue, {color: props.theme.colors.feeding}]}>{totals.feeding}</Text>
          <Text style={[styles.metricLabel, {color: props.theme.colors.textMuted}]}>수유 횟수</Text>
          <Text style={[styles.metricSub, {color: props.theme.colors.text}]}>{Math.round(totals.volume)}ml</Text>
        </View>
        <View style={[styles.metric, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={[styles.metricValue, {color: props.theme.colors.sleep}]}>{formatDuration(totals.sleep)}</Text>
          <Text style={[styles.metricLabel, {color: props.theme.colors.textMuted}]}>총 수면</Text>
          <Text style={[styles.metricSub, {color: props.theme.colors.text}]}>{totals.diapers}회 기저귀</Text>
        </View>
      </View>

      <View style={[styles.card, {backgroundColor: props.theme.colors.surface}]}>
        <Text style={[styles.cardTitle, {color: props.theme.colors.text}]}>수유 횟수</Text>
        <Text style={[styles.cardHint, {color: props.theme.colors.textMuted}]}>구간별 기록</Text>
        <BarChart
          color={props.theme.colors.feeding}
          labels={buckets.map(bucket => bucket.label)}
          theme={props.theme}
          values={buckets.map(bucket => bucket.summary.feedingCount)}
        />
      </View>
      <View style={[styles.card, {backgroundColor: props.theme.colors.surface}]}>
        <Text style={[styles.cardTitle, {color: props.theme.colors.text}]}>수면 시간</Text>
        <Text style={[styles.cardHint, {color: props.theme.colors.textMuted}]}>구간별 시간</Text>
        <BarChart
          color={props.theme.colors.sleep}
          labels={buckets.map(bucket => bucket.label)}
          theme={props.theme}
          values={buckets.map(bucket => bucket.summary.sleepDurationSeconds / 3_600)}
        />
      </View>
      <View style={[styles.disclaimer, {backgroundColor: props.theme.colors.primarySoft}]}>
        <Text style={styles.disclaimerIcon}>ⓘ</Text>
        <Text style={[styles.disclaimerText, {color: props.theme.colors.text}]}>통계는 돌봄 기록을 요약한 참고 정보이며 의료 판단이나 진단을 제공하지 않습니다.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: 30, paddingHorizontal: 18, paddingTop: 14},
  title: {fontSize: 27, fontWeight: '900', letterSpacing: -0.7},
  subtitle: {fontSize: 12, marginTop: 5},
  periods: {borderRadius: 14, flexDirection: 'row', marginTop: 20, padding: 4},
  period: {alignItems: 'center', borderRadius: 11, flex: 1, paddingVertical: 9},
  periodText: {fontSize: 12, fontWeight: '800'},
  overview: {flexDirection: 'row', gap: 10, marginTop: 16},
  metric: {borderRadius: 18, flex: 1, padding: 16},
  metricValue: {fontSize: 20, fontWeight: '900'},
  metricLabel: {fontSize: 11, marginTop: 4},
  metricSub: {fontSize: 12, fontWeight: '700', marginTop: 11},
  card: {borderRadius: 19, marginTop: 12, padding: 17},
  cardTitle: {fontSize: 16, fontWeight: '800'},
  cardHint: {fontSize: 10, marginTop: 3},
  chart: {alignItems: 'flex-end', flexDirection: 'row', gap: 5, height: 155, marginTop: 16},
  barColumn: {alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end'},
  barValue: {fontSize: 9, height: 14},
  barTrack: {borderRadius: 6, flex: 1, justifyContent: 'flex-end', overflow: 'hidden', width: '68%'},
  bar: {borderRadius: 6, minHeight: 0, width: '100%'},
  barLabel: {fontSize: 8, marginTop: 6},
  disclaimer: {alignItems: 'flex-start', borderRadius: 16, flexDirection: 'row', marginTop: 14, padding: 14},
  disclaimerIcon: {fontSize: 15, marginRight: 9},
  disclaimerText: {flex: 1, fontSize: 11, lineHeight: 17},
});
