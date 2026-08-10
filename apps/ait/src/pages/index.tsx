import {createRoute} from '@granite-js/react-native';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  assessMedicationTiming,
  buildCareStatsBuckets,
  medicationIdentity,
  nextMedicationTime,
  type MedicationEvent,
} from '../../../../packages/product-core/src/index.ts';

import {
  bootstrapCareSession,
  createCareGroup,
  createInviteCode,
  deleteCareAccount,
  joinCareGroup,
  recordQuickCareEvent,
  reloadCareSession,
  todaySummary,
  type AitCareRecordInput,
  type ReadyCareSession,
} from '../services/babycare-backend';
import {babycareAnalytics} from '../services/analytics';
import {
  appsInTossRewardedAd,
  statsDetailUnlockedUntilOnAit,
  unlockStatsDetailOnAit,
} from '../services/rewarded-ad';

export const Route = createRoute('/', {component: BabyNestHome});

type Tab = 'home' | 'timeline' | 'stats' | 'more';

const TABS: readonly {readonly id: Tab; readonly label: string}[] = [
  {id: 'home', label: '홈'},
  {id: 'timeline', label: '기록'},
  {id: 'stats', label: '통계'},
  {id: 'more', label: '더보기'},
];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function eventLabel(event: ReadyCareSession['events'][number]): string {
  if (event.kind === 'feeding') {
    return `수유 · ${event.volumeMl ?? 0}ml`;
  }
  if (event.kind === 'diaper') {
    return `기저귀 · ${
      event.diaperType === 'dirty'
        ? '대변'
        : event.diaperType === 'mixed'
          ? '소변·대변'
          : '소변'
    }`;
  }
  if (event.kind === 'temperature') {
    return `체온 · ${event.temperatureCelsius.toFixed(1)}°C`;
  }
  if (event.kind === 'medication') {
    const unit =
      event.doseUnit === 'tablet'
        ? '정'
        : event.doseUnit === 'drop'
          ? '방울'
          : event.doseUnit;
    return `복약 · ${event.medicationName} ${event.doseAmount}${unit}`;
  }
  if (event.endedAt === undefined) {
    return '수면 · 자는 중';
  }
  return `수면 · ${Math.max(
    1,
    Math.round((event.endedAt - event.startedAt) / 60000),
  )}분`;
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  tone = 'primary',
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly tone?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.actionButton,
        tone === 'secondary' && styles.actionButtonSecondary,
        tone === 'danger' && styles.actionButtonDanger,
        (pressed || disabled) && styles.pressed,
      ]}>
      <Text
        style={[
          styles.actionButtonText,
          tone === 'secondary' && styles.actionButtonSecondaryText,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Onboarding({onReady}: {readonly onReady: (value: ReadyCareSession) => void}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [caregiverName, setCaregiverName] = useState('');
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    if (!caregiverName.trim()) {
      setError('양육자 이름을 입력해 주세요.');
      return;
    }
    if (mode === 'create' && (!babyName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))) {
      setError('아기 이름과 생년월일을 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }
    if (mode === 'join' && inviteCode.replace(/\s/g, '').length !== 6) {
      setError('6자리 초대 코드를 확인해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ready =
        mode === 'create'
          ? await createCareGroup({caregiverName, babyName, birthDate})
          : await joinCareGroup({caregiverName, code: inviteCode});
      await babycareAnalytics.track({
        name: mode === 'create' ? 'bc_group_created' : 'bc_invite_joined',
        params: {},
      });
      await babycareAnalytics.track({
        name: 'bc_onboarding_complete',
        params: {mode},
      });
      onReady(ready);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [babyName, birthDate, caregiverName, inviteCode, mode, onReady]);

  return (
    <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>함께봄</Text>
        <Text style={styles.title}>함께 남기는{`\n`}아기 돌봄 기록</Text>
        <Text style={styles.description}>
          수유, 기저귀, 수면, 체온, 복약을 기록하고 초대한 양육자와 함께 확인하세요.
        </Text>
      </View>

      <View style={styles.segment}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('create')}
          style={[styles.segmentButton, mode === 'create' && styles.segmentSelected]}>
          <Text style={mode === 'create' ? styles.segmentSelectedText : styles.segmentText}>
            새 돌봄 시작
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('join')}
          style={[styles.segmentButton, mode === 'join' && styles.segmentSelected]}>
          <Text style={mode === 'join' ? styles.segmentSelectedText : styles.segmentText}>
            초대 코드 참여
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>내 이름</Text>
        <TextInput
          accessibilityLabel="양육자 이름"
          autoCapitalize="none"
          onChangeText={setCaregiverName}
          placeholder="예: 엄마"
          placeholderTextColor="#8A9A94"
          style={styles.input}
          value={caregiverName}
        />
        {mode === 'create' ? (
          <>
            <Text style={styles.fieldLabel}>아기 이름</Text>
            <TextInput
              accessibilityLabel="아기 이름"
              onChangeText={setBabyName}
              placeholder="예: 지안"
              placeholderTextColor="#8A9A94"
              style={styles.input}
              value={babyName}
            />
            <Text style={styles.fieldLabel}>생년월일</Text>
            <TextInput
              accessibilityLabel="아기 생년월일"
              keyboardType="numbers-and-punctuation"
              onChangeText={setBirthDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#8A9A94"
              style={styles.input}
              value={birthDate}
            />
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>초대 코드</Text>
            <TextInput
              accessibilityLabel="초대 코드"
              autoCapitalize="characters"
              maxLength={6}
              onChangeText={setInviteCode}
              placeholder="6자리 코드"
              placeholderTextColor="#8A9A94"
              style={styles.input}
              value={inviteCode}
            />
          </>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <ActionButton
          disabled={busy}
          label={busy ? '연결 중…' : mode === 'create' ? '함께봄 시작하기' : '돌봄 그룹 참여하기'}
          onPress={() => void submit()}
        />
      </View>
      <Text style={styles.disclaimer}>
        함께봄은 성인 양육자용 기록 도구이며 의료 판단이나 진단을 제공하지 않습니다.
      </Text>
    </ScrollView>
  );
}

function HomeTab({
  ready,
  busy,
  onRecord,
}: {
  readonly ready: ReadyCareSession;
  readonly busy: boolean;
  readonly onRecord: (input: AitCareRecordInput) => Promise<boolean>;
}) {
  const [healthForm, setHealthForm] = useState<'temperature' | 'medication'>();
  const [temperature, setTemperature] = useState('36.5');
  const [measurementSite, setMeasurementSite] = useState('armpit');
  const [medicationPreset, setMedicationPreset] = useState('acetaminophen');
  const [medicationName, setMedicationName] = useState('아세트아미노펜');
  const [medicationCategory, setMedicationCategory] = useState<
    'antipyretic' | 'antibiotic' | 'other'
  >('antipyretic');
  const [activeIngredient, setActiveIngredient] = useState<
    'acetaminophen' | 'ibuprofen' | 'other'
  >('acetaminophen');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseUnit, setDoseUnit] = useState<'ml' | 'mg' | 'tablet' | 'drop'>('ml');
  const [intervalHours, setIntervalHours] = useState('4');
  const [warningConfirmed, setWarningConfirmed] = useState(false);
  const summary = todaySummary(ready);
  const activeSleep = ready.events.some(
    event => event.kind === 'sleep' && event.endedAt === undefined,
  );
  const recentMedications = useMemo(() => {
    const unique = new Map<string, MedicationEvent>();
    for (const event of ready.events) {
      if (event.kind !== 'medication' || event.activeIngredient !== 'other') {
        continue;
      }
      unique.set(medicationIdentity(event), event);
      if (unique.size === 3) {
        break;
      }
    }
    return [...unique.values()];
  }, [ready.events]);
  const parsedDose = Number(doseAmount);
  const parsedInterval = Math.round(Number(intervalHours) * 60);
  const medicationValid =
    medicationName.trim().length > 0 &&
    Number.isFinite(parsedDose) &&
    parsedDose > 0 &&
    Number.isInteger(parsedInterval) &&
    parsedInterval >= 15 &&
    parsedInterval <= 10_080;
  const medicationAssessment = medicationValid
    ? assessMedicationTiming(ready.events, {
        occurredAt: Date.now(),
        medicationName,
        medicationCategory,
        activeIngredient,
        minimumIntervalMinutes: parsedInterval,
      })
    : undefined;
  const warning = medicationAssessment?.sameMedication
    ? `${medicationAssessment.sameMedication.medicationName}의 확인한 최소 간격 안입니다. 실제 복약 시각을 다시 확인해 주세요.`
    : medicationAssessment?.otherAntipyretic
      ? '다른 해열제와 같은 시각입니다. 의료진 안내와 실제 복약 시각을 다시 확인해 주세요.'
      : '';

  const selectMedication = (
    preset: string,
    recent?: MedicationEvent,
  ) => {
    setMedicationPreset(preset);
    setWarningConfirmed(false);
    if (recent) {
      setMedicationName(recent.medicationName);
      setMedicationCategory(recent.medicationCategory);
      setActiveIngredient(recent.activeIngredient);
      setDoseAmount(String(recent.doseAmount));
      setDoseUnit(recent.doseUnit);
      setIntervalHours(String(recent.minimumIntervalMinutes / 60));
      return;
    }
    setDoseAmount('');
    setDoseUnit('ml');
    if (preset === 'acetaminophen') {
      setMedicationName('아세트아미노펜');
      setMedicationCategory('antipyretic');
      setActiveIngredient('acetaminophen');
      setIntervalHours('4');
    } else if (preset === 'ibuprofen') {
      setMedicationName('이부프로펜');
      setMedicationCategory('antipyretic');
      setActiveIngredient('ibuprofen');
      setIntervalHours('6');
    } else {
      setMedicationName('');
      setMedicationCategory(preset === 'antibiotic' ? 'antibiotic' : 'other');
      setActiveIngredient('other');
      setIntervalHours('');
    }
  };

  const saveHealthRecord = async () => {
    if (healthForm === 'temperature') {
      const value = Number(temperature);
      if (!Number.isFinite(value) || value < 30 || value > 45) {
        return;
      }
      if (
        await onRecord({
          kind: 'temperature',
          temperatureCelsius: value,
          measurementSite: measurementSite as
            | 'armpit'
            | 'ear'
            | 'forehead'
            | 'oral'
            | 'rectal'
            | 'other',
        })
      ) {
        setHealthForm(undefined);
      }
      return;
    }
    if (!medicationValid) {
      return;
    }
    if (medicationAssessment?.requiresAcknowledgement && !warningConfirmed) {
      setWarningConfirmed(true);
      return;
    }
    if (
      await onRecord({
        kind: 'medication',
        medicationName,
        medicationCategory,
        activeIngredient,
        doseAmount: parsedDose,
        doseUnit,
        minimumIntervalMinutes: parsedInterval,
      })
    ) {
      setHealthForm(undefined);
    }
  };

  const nextTimeLabel = (value: number | undefined) =>
    value === undefined
      ? '이전 기록 없음'
      : value <= Date.now()
        ? '확인한 간격 지남'
        : new Intl.DateTimeFormat('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }).format(value);

  return (
    <>
      <View style={styles.heroCompact}>
        <Text style={styles.eyebrow}>오늘도 함께 돌봐요</Text>
        <Text style={styles.babyTitle}>{ready.baby.name}</Text>
        <Text style={styles.description}>{ready.membership.displayName}님이 기록 중이에요.</Text>
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.feedingCount}</Text>
          <Text style={styles.summaryLabel}>수유</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.diaperCount}</Text>
          <Text style={styles.summaryLabel}>기저귀</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>
            {Math.round(summary.sleepDurationSeconds / 3600)}h
          </Text>
          <Text style={styles.summaryLabel}>수면</Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>빠른 기록</Text>
      <View style={styles.quickGrid}>
        <ActionButton disabled={busy} label="수유 120ml" onPress={() => void onRecord('feeding')} />
        <ActionButton disabled={busy} label="기저귀 소변" onPress={() => void onRecord('diaper')} />
        <ActionButton
          disabled={busy}
          label={activeSleep ? '수면 종료' : '수면 시작'}
          onPress={() => void onRecord('sleep')}
        />
        <ActionButton disabled={busy} label="체온 기록" onPress={() => setHealthForm('temperature')} tone="secondary" />
        <ActionButton disabled={busy} label="복약 기록" onPress={() => setHealthForm('medication')} tone="secondary" />
      </View>
      {healthForm === 'temperature' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>체온 기록</Text>
          <Text style={styles.fieldLabel}>체온 °C</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setTemperature}
            style={styles.input}
            value={temperature}
          />
          <Text style={styles.fieldLabel}>측정 부위</Text>
          <View style={styles.compactChoices}>
            {[
              ['armpit', '겨드랑이'],
              ['ear', '귀'],
              ['forehead', '이마'],
              ['oral', '입'],
              ['rectal', '직장'],
              ['other', '기타'],
            ].map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setMeasurementSite(value!)}
                style={[
                  styles.choiceChip,
                  measurementSite === value && styles.choiceChipSelected,
                ]}>
                <Text style={measurementSite === value ? styles.choiceTextSelected : styles.choiceText}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <ActionButton disabled={busy} label="체온 저장" onPress={() => void saveHealthRecord()} />
        </View>
      ) : null}
      {healthForm === 'medication' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>복약 기록</Text>
          <Text style={styles.fieldLabel}>약 선택</Text>
          <View style={styles.compactChoices}>
            {[
              ['acetaminophen', '아세트아미노펜'],
              ['ibuprofen', '이부프로펜'],
              ['antibiotic', '항생제'],
              ['custom', '직접 입력'],
            ].map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => selectMedication(value!)}
                style={[
                  styles.choiceChip,
                  medicationPreset === value && styles.choiceChipSelected,
                ]}>
                <Text style={medicationPreset === value ? styles.choiceTextSelected : styles.choiceText}>
                  {label}
                </Text>
              </Pressable>
            ))}
            {recentMedications.map(event => {
              const value = `recent:${event.id}`;
              return (
                <Pressable
                  key={value}
                  onPress={() => selectMedication(value, event)}
                  style={[
                    styles.choiceChip,
                    medicationPreset === value && styles.choiceChipSelected,
                  ]}>
                  <Text style={medicationPreset === value ? styles.choiceTextSelected : styles.choiceText}>
                    {event.medicationName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>약 이름</Text>
          <TextInput onChangeText={setMedicationName} placeholder="제품명 또는 처방 약 이름" style={styles.input} value={medicationName} />
          <Text style={styles.fieldLabel}>실제로 먹인 양</Text>
          <TextInput keyboardType="decimal-pad" onChangeText={setDoseAmount} placeholder="예: 3.5" style={styles.input} value={doseAmount} />
          <View style={styles.compactChoices}>
            {(['ml', 'mg', 'tablet', 'drop'] as const).map(value => (
              <Pressable
                key={value}
                onPress={() => setDoseUnit(value)}
                style={[styles.choiceChip, doseUnit === value && styles.choiceChipSelected]}>
                <Text style={doseUnit === value ? styles.choiceTextSelected : styles.choiceText}>
                  {value === 'tablet' ? '정' : value === 'drop' ? '방울' : value}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>최소 복용 간격 시간</Text>
          <TextInput keyboardType="decimal-pad" onChangeText={setIntervalHours} placeholder="제품 라벨 또는 의료진 안내" style={styles.input} value={intervalHours} />
          <Text style={styles.cardMeta}>제품 라벨이나 의료진 안내에서 확인한 간격을 입력하세요.</Text>
          <View style={styles.scheduleBox}>
            <Text style={styles.fieldLabel}>해열제 간격 확인</Text>
            <Text style={styles.cardMeta}>아세트아미노펜 · {nextTimeLabel(nextMedicationTime(ready.events, 'acetaminophen'))}</Text>
            <Text style={styles.cardMeta}>이부프로펜 · {nextTimeLabel(nextMedicationTime(ready.events, 'ibuprofen'))}</Text>
          </View>
          <Text style={styles.disclaimer}>
            함께봄은 의료기기가 아니며 용량을 추천하지 않습니다. 특히 2세 미만 아세트아미노펜과 6개월 미만 이부프로펜은 의료진 안내를 먼저 확인하고, 두 해열제를 동시에 먹이거나 임의로 교차 복용하지 마세요.
          </Text>
          {warning ? <Text style={styles.errorText}>{warning}</Text> : null}
          <ActionButton
            disabled={busy || !medicationValid}
            label={warning && !warningConfirmed ? '경고 확인 후 기록' : '복약 저장'}
            onPress={() => void saveHealthRecord()}
          />
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>최근 기록</Text>
      {ready.events.slice(0, 3).map(event => (
        <View key={event.id} style={styles.eventRow}>
          <Text style={styles.eventTitle}>{eventLabel(event)}</Text>
          <Text style={styles.eventTime}>{formatClock(event.occurredAt)}</Text>
        </View>
      ))}
      {ready.events.length === 0 ? (
        <Text style={styles.emptyText}>첫 돌봄 기록을 남겨 보세요.</Text>
      ) : null}
    </>
  );
}

function TimelineTab({ready}: {readonly ready: ReadyCareSession}) {
  return (
    <>
      <Text style={styles.pageTitle}>돌봄 기록</Text>
      <Text style={styles.pageSubtitle}>공동 양육자가 남긴 최신 기록을 확인해요.</Text>
      {ready.events.map(event => (
        <View key={event.id} style={styles.timelineRow}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineContent}>
            <Text style={styles.eventTitle}>{eventLabel(event)}</Text>
            <Text style={styles.eventTime}>
              {formatClock(event.occurredAt)} · {event.caregiverId === ready.uid ? '내 기록' : '공동 양육자'}
            </Text>
          </View>
        </View>
      ))}
      {ready.events.length === 0 ? <Text style={styles.emptyText}>아직 기록이 없어요.</Text> : null}
    </>
  );
}

function StatsTab({ready}: {readonly ready: ReadyCareSession}) {
  const summary = todaySummary(ready);
  const [unlockedUntil, setUnlockedUntil] = useState<number>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adError, setAdError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const today = new Date(now).setHours(0, 0, 0, 0);
  const ranges = useMemo(
    () =>
      Array.from({length: 7}, (_, index) => {
        const from = today - (6 - index) * 86_400_000;
        return {from, to: from + 86_400_000};
      }),
    [today],
  );
  const daily = useMemo(
    () => buildCareStatsBuckets(ready.events, ranges, now),
    [now, ranges, ready.events],
  );

  useEffect(() => {
    let active = true;
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    statsDetailUnlockedUntilOnAit(Date.now())
      .then(expiry => {
        if (active) {
          setUnlockedUntil(expiry);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setLoaded(true);
        }
      });
    void appsInTossRewardedAd.preload();
    return () => {
      active = false;
      clearInterval(clock);
    };
  }, []);

  const unlock = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setAdError(false);
    try {
      await babycareAnalytics.track({
        name: 'core_ad_request',
        params: {placement: 'stats_detail', ad_format: 'rewarded'},
      });
      const result = await appsInTossRewardedAd.show();
      if (result.status !== 'unavailable') {
        await babycareAnalytics.track({
          name: 'core_ad_impression',
          params: {
            placement: 'stats_detail',
            ad_format: 'rewarded',
            network: result.network,
          },
        });
      }
      if (result.status === 'rewarded') {
        const rewardedAt = Date.now();
        setNow(rewardedAt);
        setUnlockedUntil(await unlockStatsDetailOnAit(rewardedAt));
        await babycareAnalytics.track({
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
      setBusy(false);
    }
  }, [busy]);

  return (
    <>
      <Text style={styles.pageTitle}>오늘 통계</Text>
      <Text style={styles.pageSubtitle}>오늘 0시부터 지금까지의 돌봄을 모았어요.</Text>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>수유</Text>
        <Text style={styles.statValue}>
          {summary.feedingCount}회 · {summary.feedingVolumeMl}ml
        </Text>
      </View>
      {!loaded ? (
        <View style={styles.card}>
          <Text style={styles.cardMeta}>상세 통계 이용 상태를 확인하고 있어요.</Text>
        </View>
      ) : unlockedUntil && unlockedUntil > now ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>최근 7일 상세</Text>
          {daily.map(bucket => (
            <View key={bucket.from} style={styles.detailRow}>
              <Text style={styles.detailDate}>
                {new Intl.DateTimeFormat('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                }).format(bucket.from)}
              </Text>
              <Text style={styles.detailValue}>
                수유 {bucket.summary.feedingCount} · 기저귀{' '}
                {bucket.summary.diaperCount} · 수면{' '}
                {Math.round(bucket.summary.sleepDurationSeconds / 60)}분
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>상세 통계 24시간 열기</Text>
          <Text style={styles.cardMeta}>
            선택형 광고 한 편을 보면 최근 7일의 일별 상세 통계를 24시간 확인할 수 있어요.
          </Text>
          <ActionButton
            disabled={busy}
            label={busy ? '광고 준비 중…' : '광고 보고 상세 통계 열기'}
            onPress={() => void unlock()}
          />
          {adError ? (
            <Text style={styles.errorText}>
              광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </Text>
          ) : null}
        </View>
      )}
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>기저귀</Text>
        <Text style={styles.statValue}>{summary.diaperCount}회</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>수면</Text>
        <Text style={styles.statValue}>
          {Math.floor(summary.sleepDurationSeconds / 3600)}시간{' '}
          {Math.round((summary.sleepDurationSeconds % 3600) / 60)}분
        </Text>
      </View>
    </>
  );
}

function MoreTab({
  ready,
  busy,
  onDeleted,
}: {
  readonly ready: ReadyCareSession;
  readonly busy: boolean;
  readonly onDeleted: () => void;
}) {
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const createInvite = useCallback(async () => {
    setError('');
    try {
      setInvite(await createInviteCode(ready));
      await babycareAnalytics.track({name: 'bc_invite_created', params: {}});
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [ready]);

  const deleteAccount = useCallback(async () => {
    setError('');
    try {
      await deleteCareAccount(ready);
      onDeleted();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [onDeleted, ready]);

  return (
    <>
      <Text style={styles.pageTitle}>돌봄 그룹</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{ready.group.name}</Text>
        <Text style={styles.cardMeta}>
          {ready.membership.membershipRole === 'owner' ? '그룹 관리자' : '공동 양육자'} · {ready.membership.displayName}
        </Text>
        {ready.membership.membershipRole === 'owner' ? (
          <ActionButton
            disabled={busy}
            label="초대 코드 만들기"
            onPress={() => void createInvite()}
            tone="secondary"
          />
        ) : null}
        {invite ? (
          <View style={styles.inviteBox}>
            <Text style={styles.inviteLabel}>6자리 초대 코드</Text>
            <Text selectable style={styles.inviteCode}>{invite}</Text>
            <Text style={styles.cardMeta}>코드는 한 번만 사용할 수 있고 24시간 뒤 만료돼요.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>개인정보와 계정</Text>
        <Text style={styles.cardMeta}>
          계정을 삭제하면 참여 중인 돌봄 그룹과 기록이 정책에 따라 영구 삭제됩니다.
        </Text>
        {!confirmDelete ? (
          <ActionButton label="계정 삭제" onPress={() => setConfirmDelete(true)} tone="secondary" />
        ) : (
          <View style={styles.deleteConfirm}>
            <Text style={styles.dangerText}>삭제 후에는 복구할 수 없어요.</Text>
            <ActionButton
              disabled={busy}
              label="계정과 돌봄 데이터 완전히 삭제"
              onPress={() => void deleteAccount()}
              tone="danger"
            />
            <ActionButton label="취소" onPress={() => setConfirmDelete(false)} tone="secondary" />
          </View>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Text style={styles.disclaimer}>
        함께봄은 의료 판단, 진단, 처방 또는 치료 조언을 제공하지 않습니다.
      </Text>
    </>
  );
}

export function BabyNestHome() {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState<ReadyCareSession>();
  const [tab, setTab] = useState<Tab>('home');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  useEffect(() => {
    void babycareAnalytics.track({
      name: 'core_screen_view',
      params: {screen_name: tab, screen_class: 'BabyNestHome'},
    });
  }, [tab]);

  const refresh = useCallback(async () => {
    if (!ready) {
      return;
    }
    setRefreshing(true);
    setError('');
    try {
      setReady(await reloadCareSession(ready));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRefreshing(false);
    }
  }, [ready]);

  const record = useCallback(
    async (input: AitCareRecordInput): Promise<boolean> => {
      if (!ready) {
        return false;
      }
      const kind = typeof input === 'string' ? input : input.kind;
      setBusy(true);
      setError('');
      try {
        const activeSleep = ready.events.some(
          event => event.kind === 'sleep' && event.endedAt === undefined,
        );
        const first = ready.events.length === 0;
        setReady(await recordQuickCareEvent(ready, input));
        const updated = kind === 'sleep' && activeSleep;
        await babycareAnalytics.track({
          name: updated ? 'bc_log_update' : 'bc_log_create',
          params: {type: kind},
        });
        if (first && !updated) {
          await babycareAnalytics.track({
            name: 'bc_first_log',
            params: {type: kind},
          });
        }
        return true;
      } catch (caught) {
        setError(errorMessage(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [ready],
  );

  const content = useMemo(() => {
    if (!ready) {
      return null;
    }
    if (tab === 'home') {
      return <HomeTab ready={ready} busy={busy} onRecord={record} />;
    }
    if (tab === 'timeline') {
      return <TimelineTab ready={ready} />;
    }
    if (tab === 'stats') {
      return <StatsTab ready={ready} />;
    }
    return (
      <MoreTab
        ready={ready}
        busy={busy}
        onDeleted={() => {
          setReady(undefined);
          setTab('home');
        }}
      />
    );
  }, [busy, ready, record, tab]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <ActivityIndicator color="#397663" size="large" />
        <Text style={styles.loadingText}>돌봄 기록을 불러오는 중이에요.</Text>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {error ? (
          <View style={styles.bootstrapError}>
            <Text style={styles.errorText}>{error}</Text>
            <ActionButton label="다시 연결" onPress={() => void bootstrap()} />
          </View>
        ) : (
          <Onboarding onReady={setReady} />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#397663" />
        }>
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {content}
      </ScrollView>
      <View style={styles.tabBar}>
        {TABS.map(item => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => setTab(item.id)}
            style={styles.tabButton}>
            <Text style={[styles.tabText, tab === item.id && styles.tabTextSelected]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#F5F8F6'},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#F5F8F6'},
  loadingText: {color: '#536962', fontSize: 15},
  content: {padding: 20, paddingBottom: 34, gap: 16},
  onboardingContent: {padding: 20, paddingBottom: 40, gap: 18},
  hero: {gap: 9, borderRadius: 24, backgroundColor: '#DFF1EB', padding: 22},
  heroCompact: {gap: 6, borderRadius: 22, backgroundColor: '#DFF1EB', padding: 20},
  eyebrow: {color: '#397663', fontSize: 14, fontWeight: '800'},
  title: {color: '#1C2925', fontSize: 30, fontWeight: '900', lineHeight: 39},
  babyTitle: {color: '#1C2925', fontSize: 28, fontWeight: '900'},
  description: {color: '#536962', fontSize: 15, lineHeight: 22},
  segment: {flexDirection: 'row', borderRadius: 14, backgroundColor: '#E6ECE9', padding: 4},
  segmentButton: {flex: 1, alignItems: 'center', borderRadius: 11, paddingVertical: 11},
  segmentSelected: {backgroundColor: '#FFFFFF'},
  segmentText: {color: '#667872', fontSize: 14, fontWeight: '700'},
  segmentSelectedText: {color: '#27614F', fontSize: 14, fontWeight: '800'},
  card: {gap: 12, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 18},
  cardTitle: {color: '#1C2925', fontSize: 19, fontWeight: '800'},
  cardMeta: {color: '#667872', fontSize: 14, lineHeight: 21},
  fieldLabel: {color: '#31453E', fontSize: 14, fontWeight: '700'},
  input: {borderWidth: 1, borderColor: '#D5DFDB', borderRadius: 13, backgroundColor: '#FAFCFB', color: '#1C2925', fontSize: 16, paddingHorizontal: 14, paddingVertical: 13},
  actionButton: {minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#397663', paddingHorizontal: 16, paddingVertical: 12},
  actionButtonSecondary: {borderWidth: 1, borderColor: '#AFC8BF', backgroundColor: '#F6FAF8'},
  actionButtonDanger: {backgroundColor: '#C94B4B'},
  actionButtonText: {color: '#FFFFFF', fontSize: 15, fontWeight: '800'},
  actionButtonSecondaryText: {color: '#397663'},
  pressed: {opacity: 0.55},
  disclaimer: {color: '#76867F', fontSize: 12, lineHeight: 18, textAlign: 'center'},
  errorText: {color: '#B43F3F', fontSize: 14, lineHeight: 20},
  errorBanner: {borderRadius: 12, backgroundColor: '#FDEAEA', color: '#9E3333', fontSize: 14, padding: 12},
  bootstrapError: {flex: 1, justifyContent: 'center', gap: 16, padding: 24},
  summaryRow: {flexDirection: 'row', gap: 10},
  summaryCard: {flex: 1, alignItems: 'center', gap: 3, borderRadius: 17, backgroundColor: '#FFFFFF', paddingVertical: 16},
  summaryValue: {color: '#27614F', fontSize: 24, fontWeight: '900'},
  summaryLabel: {color: '#667872', fontSize: 13, fontWeight: '700'},
  sectionTitle: {marginTop: 3, color: '#1C2925', fontSize: 18, fontWeight: '900'},
  quickGrid: {gap: 10},
  compactChoices: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  choiceChip: {borderWidth: 1, borderColor: '#C9D8D2', borderRadius: 11, backgroundColor: '#F6FAF8', paddingHorizontal: 12, paddingVertical: 9},
  choiceChipSelected: {borderColor: '#397663', backgroundColor: '#397663'},
  choiceText: {color: '#536962', fontSize: 12, fontWeight: '700'},
  choiceTextSelected: {color: '#FFFFFF', fontSize: 12, fontWeight: '800'},
  scheduleBox: {gap: 6, borderRadius: 14, backgroundColor: '#F1F6F4', padding: 14},
  eventRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16},
  eventTitle: {color: '#25342F', fontSize: 15, fontWeight: '800'},
  eventTime: {color: '#7A8984', fontSize: 12},
  emptyText: {borderRadius: 16, backgroundColor: '#FFFFFF', color: '#76867F', fontSize: 14, padding: 20, textAlign: 'center'},
  pageTitle: {color: '#1C2925', fontSize: 25, fontWeight: '900'},
  pageSubtitle: {marginTop: -8, color: '#667872', fontSize: 14, lineHeight: 21},
  timelineRow: {flexDirection: 'row', gap: 12, borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16},
  timelineDot: {width: 10, height: 10, marginTop: 5, borderRadius: 5, backgroundColor: '#5FB49C'},
  timelineContent: {flex: 1, gap: 5},
  statCard: {gap: 6, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 18},
  statLabel: {color: '#667872', fontSize: 14, fontWeight: '700'},
  statValue: {color: '#27614F', fontSize: 23, fontWeight: '900'},
  detailRow: {flexDirection: 'row', gap: 12, justifyContent: 'space-between'},
  detailDate: {color: '#536962', fontSize: 13, fontWeight: '800'},
  detailValue: {color: '#27614F', flex: 1, fontSize: 13, textAlign: 'right'},
  inviteBox: {alignItems: 'center', gap: 5, borderRadius: 16, backgroundColor: '#EAF6F1', padding: 16},
  inviteLabel: {color: '#536962', fontSize: 13, fontWeight: '700'},
  inviteCode: {color: '#27614F', fontSize: 30, fontWeight: '900', letterSpacing: 5},
  deleteConfirm: {gap: 10},
  dangerText: {color: '#B43F3F', fontSize: 14, fontWeight: '700'},
  tabBar: {flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#CED9D5', backgroundColor: '#FFFFFF', paddingVertical: 8},
  tabButton: {flex: 1, alignItems: 'center', paddingVertical: 9},
  tabText: {color: '#8A9994', fontSize: 13, fontWeight: '700'},
  tabTextSelected: {color: '#397663', fontWeight: '900'},
});
