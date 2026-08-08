import {useCallback, useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildCareStatsBuckets,
  statsDetailUnlockedUntil,
  unlockStatsDetail,
  type AnalyticsPort,
  type CareEvent,
  type CareStatsBucket,
  type RewardedAdPort,
  type StringStoragePort,
} from '@babycare/product-core';

import {formatDuration} from '../app/format';
import type {Strings} from '../app/i18n';
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
  strings: Strings,
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
          ? new Intl.DateTimeFormat(strings.intlLocale, {
              hour: 'numeric',
            }).format(range.from)
          : new Intl.DateTimeFormat(strings.intlLocale, {
              month: 'numeric',
              day: 'numeric',
            }).format(range.to - 1),
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
  readonly strings: Strings;
  readonly theme: AppTheme;
  readonly analytics?: AnalyticsPort;
  readonly rewardedAd?: RewardedAdPort;
  readonly storage?: StringStoragePort;
}) {
  const strings = props.strings;
  const storage = props.storage ?? AsyncStorage;
  const [period, setPeriod] = useState<Period>('7d');
  const [unlockedUntil, setUnlockedUntil] = useState<number>();
  const [accessLoaded, setAccessLoaded] = useState(!props.rewardedAd);
  const [adBusy, setAdBusy] = useState(false);
  const [adError, setAdError] = useState(false);
  const buckets = useMemo(
    () => buildStatsBuckets(props.events, props.now, period, strings),
    [period, props.events, props.now, strings],
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
  const detailUnlocked =
    !props.rewardedAd ||
    (accessLoaded && unlockedUntil !== undefined && unlockedUntil > props.now);

  useEffect(() => {
    if (!props.rewardedAd) {
      return undefined;
    }
    let active = true;
    statsDetailUnlockedUntil(storage, props.now)
      .then(expiry => {
        if (active) {
          setUnlockedUntil(expiry);
          setAccessLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setAccessLoaded(true);
        }
      });
    props.rewardedAd.preload().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [props.now, props.rewardedAd, storage]);

  const unlockDetail = useCallback(async () => {
    if (!props.rewardedAd || adBusy) {
      return;
    }
    setAdBusy(true);
    setAdError(false);
    try {
      await props.analytics?.track({
        name: 'core_ad_request',
        params: {placement: 'stats_detail', ad_format: 'rewarded'},
      });
      const result = await props.rewardedAd.show();
      if (result.status !== 'unavailable') {
        await props.analytics?.track({
          name: 'core_ad_impression',
          params: {
            placement: 'stats_detail',
            ad_format: 'rewarded',
            network: result.network,
          },
        });
      }
      if (result.status === 'rewarded') {
        const expiry = await unlockStatsDetail(storage, Date.now());
        setUnlockedUntil(expiry);
        await props.analytics?.track({
          name: 'core_ad_reward',
          params: {
            placement: 'stats_detail',
            ad_format: 'rewarded',
            reward_code: 'stats_detail_24h',
            reward_amount: 1,
          },
        });
      } else if (result.status === 'unavailable') {
        setAdError(true);
      }
    } catch {
      setAdError(true);
    } finally {
      setAdBusy(false);
    }
  }, [adBusy, props.analytics, props.rewardedAd, storage]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={{backgroundColor: props.theme.colors.background}}>
      <Text style={[styles.title, {color: props.theme.colors.text}]}>
        {strings.stats.title}
      </Text>
      <Text style={[styles.subtitle, {color: props.theme.colors.textMuted}]}>
        {strings.stats.subtitle}
      </Text>
      <View
        accessibilityRole="tablist"
        style={[styles.periods, {backgroundColor: props.theme.colors.surfaceMuted}]}>
        {(['12h', '7d', '30d'] as const).map(value => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected: period === value}}
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
              {value === '12h'
                ? strings.stats.period12h
                : value === '7d'
                  ? strings.stats.period7d
                  : strings.stats.period30d}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.overview}>
        <View style={[styles.metric, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={[styles.metricValue, {color: props.theme.colors.feeding}]}>{totals.feeding}</Text>
          <Text style={[styles.metricLabel, {color: props.theme.colors.textMuted}]}>
            {strings.stats.feedingCount}
          </Text>
          <Text style={[styles.metricSub, {color: props.theme.colors.text}]}>{Math.round(totals.volume)}ml</Text>
        </View>
        <View style={[styles.metric, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={[styles.metricValue, {color: props.theme.colors.sleep}]}>
            {formatDuration(totals.sleep, strings)}
          </Text>
          <Text style={[styles.metricLabel, {color: props.theme.colors.textMuted}]}>
            {strings.stats.totalSleep}
          </Text>
          <Text style={[styles.metricSub, {color: props.theme.colors.text}]}>
            {strings.stats.diaperTotal(totals.diapers)}
          </Text>
        </View>
      </View>

      {!accessLoaded ? (
        <View style={[styles.detailGate, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={[styles.cardHint, {color: props.theme.colors.textMuted}]}>
            {strings.stats.detailChecking}
          </Text>
        </View>
      ) : !detailUnlocked ? (
        <View style={[styles.detailGate, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={[styles.cardTitle, {color: props.theme.colors.text}]}>
            {strings.stats.detailLockedTitle}
          </Text>
          <Text style={[styles.cardHint, {color: props.theme.colors.textMuted}]}>
            {strings.stats.detailLockedDescription}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={adBusy}
            onPress={() => {
              unlockDetail().catch(() => undefined);
            }}
            style={[styles.unlockButton, {backgroundColor: props.theme.colors.primary}]}>
            <Text style={styles.unlockButtonText}>
              {adBusy ? strings.stats.adLoading : strings.stats.unlockAction}
            </Text>
          </Pressable>
          {adError ? (
            <Text style={[styles.adError, {color: props.theme.colors.danger}]}>
              {strings.stats.adUnavailable}
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          <View style={[styles.card, {backgroundColor: props.theme.colors.surface}]}>
            <Text style={[styles.cardTitle, {color: props.theme.colors.text}]}>
              {strings.stats.feedingCount}
            </Text>
            <Text style={[styles.cardHint, {color: props.theme.colors.textMuted}]}>
              {strings.stats.perBucketCount}
            </Text>
            <BarChart
              color={props.theme.colors.feeding}
              labels={buckets.map(bucket => bucket.label)}
              theme={props.theme}
              values={buckets.map(bucket => bucket.summary.feedingCount)}
            />
          </View>
          <View style={[styles.card, {backgroundColor: props.theme.colors.surface}]}>
            <Text style={[styles.cardTitle, {color: props.theme.colors.text}]}>
              {strings.stats.sleepDuration}
            </Text>
            <Text style={[styles.cardHint, {color: props.theme.colors.textMuted}]}>
              {strings.stats.perBucketDuration}
            </Text>
            <BarChart
              color={props.theme.colors.sleep}
              labels={buckets.map(bucket => bucket.label)}
              theme={props.theme}
              values={buckets.map(bucket => bucket.summary.sleepDurationSeconds / 3_600)}
            />
          </View>
        </>
      )}
      <View style={[styles.disclaimer, {backgroundColor: props.theme.colors.primarySoft}]}>
        <Text style={styles.disclaimerIcon}>ⓘ</Text>
        <Text style={[styles.disclaimerText, {color: props.theme.colors.text}]}>
          {strings.stats.disclaimer}
        </Text>
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
  detailGate: {alignItems: 'center', borderRadius: 19, marginTop: 12, padding: 22},
  unlockButton: {borderRadius: 14, marginTop: 16, paddingHorizontal: 20, paddingVertical: 12},
  unlockButtonText: {color: '#FFFFFF', fontSize: 13, fontWeight: '900'},
  adError: {fontSize: 11, marginTop: 10, textAlign: 'center'},
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
