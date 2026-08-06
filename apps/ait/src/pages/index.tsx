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
  bootstrapCareSession,
  createCareGroup,
  createInviteCode,
  deleteCareAccount,
  joinCareGroup,
  recordQuickCareEvent,
  reloadCareSession,
  todaySummary,
  type ReadyCareSession,
} from '../services/babycare-backend';

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
      onReady(
        mode === 'create'
          ? await createCareGroup({caregiverName, babyName, birthDate})
          : await joinCareGroup({caregiverName, code: inviteCode}),
      );
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
          수유, 기저귀, 수면을 기록하고 초대한 양육자와 함께 확인하세요.
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
  readonly onRecord: (kind: 'feeding' | 'diaper' | 'sleep') => void;
}) {
  const summary = todaySummary(ready);
  const activeSleep = ready.events.some(
    event => event.kind === 'sleep' && event.endedAt === undefined,
  );
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
        <ActionButton disabled={busy} label="수유 120ml" onPress={() => onRecord('feeding')} />
        <ActionButton disabled={busy} label="기저귀 소변" onPress={() => onRecord('diaper')} />
        <ActionButton
          disabled={busy}
          label={activeSleep ? '수면 종료' : '수면 시작'}
          onPress={() => onRecord('sleep')}
        />
      </View>
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
    async (kind: 'feeding' | 'diaper' | 'sleep') => {
      if (!ready) {
        return;
      }
      setBusy(true);
      setError('');
      try {
        setReady(await recordQuickCareEvent(ready, kind));
      } catch (caught) {
        setError(errorMessage(caught));
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
      return <HomeTab ready={ready} busy={busy} onRecord={kind => void record(kind)} />;
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
