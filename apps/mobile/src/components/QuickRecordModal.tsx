import {useEffect, useMemo, useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  CareEventKind,
  CreateCareEventInput,
  DiaperType,
  FeedingType,
  SleepType,
} from '@babycare/product-core';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {formatDuration} from '../app/format';
import {domainContext, type LocalSession} from '../app/session';
import type {AppTheme} from '../app/theme';

function Choice<T extends string>(props: {
  readonly value: T;
  readonly selected: T;
  readonly label: string;
  readonly onSelect: (value: T) => void;
  readonly theme: AppTheme;
}) {
  const active = props.value === props.selected;
  const choiceColor = active ? '#FFFFFF' : props.theme.colors.text;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{selected: active}}
      onPress={() => props.onSelect(props.value)}
      style={[
        styles.choice,
        {
          backgroundColor: active ? props.theme.colors.primary : props.theme.colors.surfaceMuted,
          borderColor: active ? props.theme.colors.primary : props.theme.colors.border,
        },
      ]}>
      <Text style={[styles.choiceText, {color: choiceColor}]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function QuickRecordModal(props: {
  readonly kind: CareEventKind | undefined;
  readonly session: LocalSession;
  readonly theme: AppTheme;
  readonly onClose: () => void;
  readonly onSave: (input: CreateCareEventInput) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [feedingType, setFeedingType] = useState<FeedingType>('formula');
  const [breastSide, setBreastSide] = useState<'left' | 'right'>('left');
  const [volumeMl, setVolumeMl] = useState(120);
  const [diaperType, setDiaperType] = useState<DiaperType>('wet');
  const [sleepType, setSleepType] = useState<SleepType>('nap');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(Date.now());
  const [timeEdited, setTimeEdited] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | undefined>();
  const [activeTimerSide, setActiveTimerSide] = useState<'left' | 'right'>();
  const [leftAccumulatedMs, setLeftAccumulatedMs] = useState(0);
  const [rightAccumulatedMs, setRightAccumulatedMs] = useState(0);
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const saveRequestInFlight = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    const intervalMs = timerStartedAt ? 250 : props.kind && !timeEdited ? 1_000 : undefined;
    if (!intervalMs) {
      return undefined;
    }
    const interval = setInterval(() => setTick(value => value + 1), intervalMs);
    return () => clearInterval(interval);
  }, [props.kind, timeEdited, timerStartedAt]);

  useEffect(() => {
    setTimerStartedAt(undefined);
    setActiveTimerSide(undefined);
    setLeftAccumulatedMs(0);
    setRightAccumulatedMs(0);
    setTick(0);
    if (props.kind) {
      setOccurredAt(Date.now());
      setTimeEdited(false);
      setNote('');
      setSaving(false);
      setErrorMessage(undefined);
    }
  }, [props.kind]);

  const elapsed = useMemo(() => {
    const runningMs = timerStartedAt ? Date.now() - timerStartedAt : 0;
    const leftMs =
      leftAccumulatedMs + (activeTimerSide === 'left' ? runningMs : 0);
    const rightMs =
      rightAccumulatedMs + (activeTimerSide === 'right' ? runningMs : 0);
    return {leftMs, rightMs, totalMs: leftMs + rightMs};
    // tick is intentionally included to refresh the wall-clock based display.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimerSide, leftAccumulatedMs, rightAccumulatedMs, tick, timerStartedAt]);

  if (!props.kind) {
    return null;
  }

  const context = domainContext(props.session);
  const selectedOccurredAt = timeEdited ? occurredAt : Date.now();
  const title = props.kind === 'feeding' ? '수유 기록' : props.kind === 'diaper' ? '기저귀 기록' : '수면 시작';
  const saveDisabled =
    props.kind === 'feeding' && feedingType === 'breast' && elapsed.totalMs < 1_000;
  const saveOpacity = saving ? 0.65 : 1;
  const timerActionLabel = `${breastSide === 'left' ? '왼쪽' : '오른쪽'} 모유 타이머 ${
    timerStartedAt ? '일시정지' : elapsed.totalMs ? '계속' : '시작'
  }`;

  const save = async () => {
    if (saveRequestInFlight.current) {
      return;
    }
    const recordTime = timeEdited ? occurredAt : Date.now();
    let input: CreateCareEventInput;
    if (props.kind === 'feeding') {
      input =
        feedingType === 'breast'
          ? {
              ...context,
              kind: 'feeding',
              feedingType,
              ...(elapsed.leftMs >= 1_000
                ? {leftDurationSeconds: Math.max(1, Math.round(elapsed.leftMs / 1_000))}
                : {}),
              ...(elapsed.rightMs >= 1_000
                ? {rightDurationSeconds: Math.max(1, Math.round(elapsed.rightMs / 1_000))}
                : {}),
              occurredAt: recordTime,
              note,
            }
          : {
              ...context,
              kind: 'feeding',
              feedingType,
              volumeMl,
              occurredAt: recordTime,
              note,
            };
    } else if (props.kind === 'diaper') {
      input = {...context, kind: 'diaper', diaperType, occurredAt: recordTime, note};
    } else {
      input = {...context, kind: 'sleep', sleepType, startedAt: recordTime, note};
    }

    saveRequestInFlight.current = true;
    setSaving(true);
    setErrorMessage(undefined);
    try {
      await props.onSave(input);
      setTimerStartedAt(undefined);
      setActiveTimerSide(undefined);
      setLeftAccumulatedMs(0);
      setRightAccumulatedMs(0);
      props.onClose();
    } catch {
      setErrorMessage(
        '기록을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
      );
    } finally {
      saveRequestInFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.fill, {backgroundColor: props.theme.colors.background}]}>
        <View style={[styles.header, {borderBottomColor: props.theme.colors.border}]}>
          <Pressable accessibilityRole="button" onPress={props.onClose} style={styles.headerButton}>
            <Text style={[styles.headerAction, {color: props.theme.colors.textMuted}]}>닫기</Text>
          </Pressable>
          <Text style={[styles.title, {color: props.theme.colors.text}]}>{title}</Text>
          <View style={styles.headerButton} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {props.kind === 'feeding' ? (
            <>
              <Text style={[styles.label, {color: props.theme.colors.text}]}>유형</Text>
              <View style={styles.choiceRow}>
                <Choice label="모유" onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="breast" />
                <Choice label="유축" onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="bottle_breastmilk" />
                <Choice label="분유" onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="formula" />
                <Choice label="이유식" onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="solid" />
              </View>
              {feedingType === 'breast' ? (
                <View style={[styles.timerCard, {backgroundColor: props.theme.colors.surface}]}>
                  <Text style={[styles.timer, {color: props.theme.colors.text}]}>
                    {formatDuration(elapsed.totalMs / 1_000)}
                  </Text>
                  <View style={styles.sideRow}>
                    <Choice
                      label={`왼쪽 ${formatDuration(elapsed.leftMs / 1_000)}`}
                      onSelect={side => {
                        const changedAt = Date.now();
                        if (timerStartedAt && activeTimerSide && activeTimerSide !== side) {
                          const delta = changedAt - timerStartedAt;
                          if (activeTimerSide === 'left') {
                            setLeftAccumulatedMs(value => value + delta);
                          } else {
                            setRightAccumulatedMs(value => value + delta);
                          }
                          setTimerStartedAt(changedAt);
                          setActiveTimerSide(side);
                        }
                        setBreastSide(side);
                      }}
                      selected={breastSide}
                      theme={props.theme}
                      value="left"
                    />
                    <Choice
                      label={`오른쪽 ${formatDuration(elapsed.rightMs / 1_000)}`}
                      onSelect={side => {
                        const changedAt = Date.now();
                        if (timerStartedAt && activeTimerSide && activeTimerSide !== side) {
                          const delta = changedAt - timerStartedAt;
                          if (activeTimerSide === 'left') {
                            setLeftAccumulatedMs(value => value + delta);
                          } else {
                            setRightAccumulatedMs(value => value + delta);
                          }
                          setTimerStartedAt(changedAt);
                          setActiveTimerSide(side);
                        }
                        setBreastSide(side);
                      }}
                      selected={breastSide}
                      theme={props.theme}
                      value="right"
                    />
                  </View>
                  <View style={styles.timerActions}>
                    <Pressable
                      accessibilityLabel={timerActionLabel}
                      accessibilityRole="button"
                      onPress={() => {
                        if (timerStartedAt) {
                          const pausedAt = Date.now();
                          const delta = pausedAt - timerStartedAt;
                          if (activeTimerSide === 'left') {
                            setLeftAccumulatedMs(value => value + delta);
                          } else if (activeTimerSide === 'right') {
                            setRightAccumulatedMs(value => value + delta);
                          }
                          setTimerStartedAt(undefined);
                          setActiveTimerSide(undefined);
                        } else {
                          setTimerStartedAt(Date.now());
                          setActiveTimerSide(breastSide);
                        }
                      }}
                      style={[styles.timerButton, {backgroundColor: props.theme.colors.primary}]}>
                      <Text style={styles.timerButtonText}>
                        {timerStartedAt ? '일시정지' : elapsed.totalMs ? '계속' : '시작'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="모유 타이머 초기화"
                      accessibilityRole="button"
                      onPress={() => {
                        setTimerStartedAt(undefined);
                        setActiveTimerSide(undefined);
                        setLeftAccumulatedMs(0);
                        setRightAccumulatedMs(0);
                      }}
                      style={[styles.resetButton, {borderColor: props.theme.colors.border}]}>
                      <Text style={[styles.resetText, {color: props.theme.colors.textMuted}]}>초기화</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[styles.label, {color: props.theme.colors.text}]}>양</Text>
                  <View style={[styles.stepper, {backgroundColor: props.theme.colors.surface}]}>
                    <Pressable
                      accessibilityLabel="수유량 10밀리리터 줄이기"
                      accessibilityRole="button"
                      onPress={() => setVolumeMl(value => Math.max(10, value - 10))}
                      style={[styles.stepButton, {borderColor: props.theme.colors.border}]}>
                      <Text style={[styles.stepText, {color: props.theme.colors.text}]}>−</Text>
                    </Pressable>
                    <View
                      accessibilityLabel={`수유량 ${volumeMl}밀리리터`}
                      accessibilityLiveRegion="polite"
                      accessible
                      style={styles.amount}>
                      <Text style={[styles.amountValue, {color: props.theme.colors.text}]}>{volumeMl}</Text>
                      <Text style={[styles.amountUnit, {color: props.theme.colors.textMuted}]}>ml</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="수유량 10밀리리터 늘리기"
                      accessibilityRole="button"
                      onPress={() => setVolumeMl(value => Math.min(2_000, value + 10))}
                      style={[styles.stepButton, {borderColor: props.theme.colors.border}]}>
                      <Text style={[styles.stepText, {color: props.theme.colors.text}]}>＋</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </>
          ) : null}

          {props.kind === 'diaper' ? (
            <>
              <Text style={[styles.label, {color: props.theme.colors.text}]}>상태</Text>
              <View style={styles.choiceRow}>
                <Choice label="소변" onSelect={setDiaperType} selected={diaperType} theme={props.theme} value="wet" />
                <Choice label="대변" onSelect={setDiaperType} selected={diaperType} theme={props.theme} value="dirty" />
                <Choice label="둘 다" onSelect={setDiaperType} selected={diaperType} theme={props.theme} value="mixed" />
              </View>
            </>
          ) : null}

          {props.kind === 'sleep' ? (
            <>
              <Text style={[styles.label, {color: props.theme.colors.text}]}>수면 유형</Text>
              <View style={styles.choiceRow}>
                <Choice label="낮잠" onSelect={setSleepType} selected={sleepType} theme={props.theme} value="nap" />
                <Choice label="밤잠" onSelect={setSleepType} selected={sleepType} theme={props.theme} value="night" />
              </View>
              <View style={[styles.sleepNotice, {backgroundColor: props.theme.colors.primarySoft}]}>
                <Text style={styles.sleepIcon}>🌙</Text>
                <Text style={[styles.sleepText, {color: props.theme.colors.text}]}>선택한 기록 시각부터 수면 시간을 측정해요. 홈의 ‘기상’ 버튼으로 종료합니다.</Text>
              </View>
            </>
          ) : null}

          <Text style={[styles.label, {color: props.theme.colors.text}]}>기록 시각</Text>
          <View style={[styles.timeRow, {backgroundColor: props.theme.colors.surface}]}>
            <View style={styles.timeCopy}>
              <Text style={[styles.timeValue, {color: props.theme.colors.text}]}>
                {new Intl.DateTimeFormat('ko-KR', {hour: 'numeric', minute: '2-digit'}).format(selectedOccurredAt)}
              </Text>
              <Text style={[styles.timeHint, {color: props.theme.colors.textMuted}]}>선택한 시각으로 저장</Text>
            </View>
            <View style={styles.timeButtons}>
              <Pressable
                accessibilityLabel="기록 시각 10분 앞당기기"
                accessibilityRole="button"
                onPress={() => {
                  setOccurredAt(selectedOccurredAt - 10 * 60_000);
                  setTimeEdited(true);
                }}
                style={[styles.smallButton, {borderColor: props.theme.colors.border}]}>
                <Text style={[styles.smallButtonText, {color: props.theme.colors.text}]}>−10분</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="기록 시각을 지금으로 설정"
                accessibilityRole="button"
                onPress={() => {
                  setOccurredAt(Date.now());
                  setTimeEdited(false);
                }}
                style={[styles.smallButton, {borderColor: props.theme.colors.border}]}>
                <Text style={[styles.smallButtonText, {color: props.theme.colors.text}]}>지금</Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.label, {color: props.theme.colors.text}]}>메모 (선택)</Text>
          <TextInput
            maxLength={500}
            multiline
            onChangeText={setNote}
            placeholder="특이사항을 남겨주세요"
            placeholderTextColor={props.theme.colors.textMuted}
            style={[
              styles.note,
              {
                backgroundColor: props.theme.colors.surface,
                borderColor: props.theme.colors.border,
                color: props.theme.colors.text,
              },
            ]}
            value={note}
          />
        </ScrollView>
        <View
          style={[
            styles.footer,
            {
              borderTopColor: props.theme.colors.border,
              paddingBottom: Math.max(16, insets.bottom + 8),
            },
          ]}>
          {errorMessage ? (
            <Text accessibilityRole="alert" style={[styles.error, {color: props.theme.colors.danger}]}>
              {errorMessage}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel={saving ? '돌봄 기록 저장 중' : '돌봄 기록 저장'}
            accessibilityRole="button"
            accessibilityState={{busy: saving, disabled: saving || saveDisabled}}
            disabled={saving || saveDisabled}
            onPress={save}
            style={[
              styles.saveButton,
              {
                backgroundColor: saveDisabled ? props.theme.colors.border : props.theme.colors.primary,
                opacity: saveOpacity,
              },
            ]}>
            <Text style={styles.saveText}>{saving ? '저장 중…' : '저장하기'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  header: {alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 58, paddingHorizontal: 16},
  headerButton: {minWidth: 52},
  headerAction: {fontSize: 15},
  title: {flex: 1, fontSize: 17, fontWeight: '800', textAlign: 'center'},
  content: {padding: 20, paddingBottom: 40},
  label: {fontSize: 13, fontWeight: '800', marginBottom: 10, marginTop: 22},
  choiceRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  choice: {borderRadius: 12, borderWidth: 1, minWidth: 72, paddingHorizontal: 15, paddingVertical: 11},
  choiceText: {fontSize: 13, fontWeight: '700', textAlign: 'center'},
  timerCard: {alignItems: 'center', borderRadius: 20, marginTop: 18, padding: 22},
  timer: {fontSize: 38, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -1},
  sideRow: {flexDirection: 'row', gap: 9, marginTop: 18},
  timerActions: {flexDirection: 'row', gap: 9, marginTop: 18, width: '100%'},
  timerButton: {alignItems: 'center', borderRadius: 13, flex: 1, justifyContent: 'center', minHeight: 49},
  timerButtonText: {color: '#FFFFFF', fontSize: 15, fontWeight: '800'},
  resetButton: {alignItems: 'center', borderRadius: 13, borderWidth: 1, justifyContent: 'center', minHeight: 49, paddingHorizontal: 18},
  resetText: {fontSize: 13, fontWeight: '700'},
  stepper: {alignItems: 'center', borderRadius: 20, flexDirection: 'row', padding: 14},
  stepButton: {alignItems: 'center', borderRadius: 15, borderWidth: 1, height: 52, justifyContent: 'center', width: 52},
  stepText: {fontSize: 24, fontWeight: '500'},
  amount: {alignItems: 'baseline', flex: 1, flexDirection: 'row', justifyContent: 'center'},
  amountValue: {fontSize: 32, fontVariant: ['tabular-nums'], fontWeight: '900'},
  amountUnit: {fontSize: 14, marginLeft: 5},
  sleepNotice: {alignItems: 'center', borderRadius: 16, flexDirection: 'row', marginTop: 18, padding: 15},
  sleepIcon: {fontSize: 24, marginRight: 12},
  sleepText: {flex: 1, fontSize: 13, lineHeight: 20},
  timeRow: {alignItems: 'center', borderRadius: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', padding: 15},
  timeCopy: {flexBasis: 120, flexGrow: 1, minWidth: 0},
  timeValue: {fontSize: 17, fontWeight: '800'},
  timeHint: {fontSize: 10, marginTop: 3},
  timeButtons: {flexDirection: 'row', flexShrink: 0, gap: 7},
  smallButton: {borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9},
  smallButtonText: {fontSize: 11, fontWeight: '700'},
  note: {borderRadius: 15, borderWidth: 1, fontSize: 15, minHeight: 95, padding: 14, textAlignVertical: 'top'},
  footer: {borderTopWidth: StyleSheet.hairlineWidth, padding: 16},
  error: {fontSize: 11, fontWeight: '700', marginBottom: 9, textAlign: 'center'},
  saveButton: {alignItems: 'center', borderRadius: 15, justifyContent: 'center', minHeight: 55},
  saveText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
});
