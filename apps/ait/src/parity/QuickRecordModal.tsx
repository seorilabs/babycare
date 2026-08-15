import React, {useEffect, useMemo, useRef, useState} from 'react';
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
  CareEvent,
  CareEventKind,
  CreateCareEventInput,
  DiaperType,
  FeedingType,
  MedicationActiveIngredient,
  MedicationCategory,
  MedicationDoseUnit,
  MedicationEvent,
  SleepType,
  TemperatureMeasurementSite,
} from '../../../../packages/product-core/src/index.ts';
import {
  assessMedicationTiming,
  medicationIdentity,
  nextMedicationTime,
} from '../../../../packages/product-core/src/index.ts';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {formatDuration} from './format';
import type {Strings} from './strings';
import {domainContext, type LocalSession} from './session';
import {aitBottomInset} from './TabBar';
import type {AppTheme} from './theme';

const EMPTY_CARE_EVENTS: readonly CareEvent[] = [];

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
  readonly events?: readonly CareEvent[];
  readonly session: LocalSession;
  readonly strings: Strings;
  readonly theme: AppTheme;
  readonly onClose: () => void;
  readonly onSave: (input: CreateCareEventInput) => Promise<void>;
}) {
  const strings = props.strings;
  const events = props.events ?? EMPTY_CARE_EVENTS;
  const insets = useSafeAreaInsets();
  const bottomInset = aitBottomInset(insets.bottom, Platform.OS);
  const [feedingType, setFeedingType] = useState<FeedingType>('formula');
  const [breastSide, setBreastSide] = useState<'left' | 'right'>('left');
  const [volumeMl, setVolumeMl] = useState(120);
  const [diaperType, setDiaperType] = useState<DiaperType>('wet');
  const [sleepType, setSleepType] = useState<SleepType>('nap');
  const [temperatureCelsius, setTemperatureCelsius] = useState(36.5);
  const [measurementSite, setMeasurementSite] =
    useState<TemperatureMeasurementSite>('armpit');
  const [medicationPreset, setMedicationPreset] = useState('acetaminophen');
  const [medicationName, setMedicationName] = useState(
    strings.quickRecord.medicationAcetaminophen,
  );
  const [medicationCategory, setMedicationCategory] =
    useState<MedicationCategory>('antipyretic');
  const [activeIngredient, setActiveIngredient] =
    useState<MedicationActiveIngredient>('acetaminophen');
  const [doseAmountText, setDoseAmountText] = useState('');
  const [doseUnit, setDoseUnit] = useState<MedicationDoseUnit>('ml');
  const [intervalHoursText, setIntervalHoursText] = useState('4');
  const [medicationWarningConfirmed, setMedicationWarningConfirmed] =
    useState(false);
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
      setMedicationWarningConfirmed(false);
    }
  }, [props.kind]);

  useEffect(() => {
    setMedicationWarningConfirmed(false);
  }, [
    activeIngredient,
    doseAmountText,
    intervalHoursText,
    medicationCategory,
    medicationName,
    occurredAt,
    timeEdited,
  ]);

  const elapsed = useMemo(() => {
    const runningMs = timerStartedAt ? Date.now() - timerStartedAt : 0;
    const leftMs =
      leftAccumulatedMs + (activeTimerSide === 'left' ? runningMs : 0);
    const rightMs =
      rightAccumulatedMs + (activeTimerSide === 'right' ? runningMs : 0);
    return {leftMs, rightMs, totalMs: leftMs + rightMs};
    // tick is intentionally included to refresh the wall-clock based display.
  }, [activeTimerSide, leftAccumulatedMs, rightAccumulatedMs, tick, timerStartedAt]);

  const recentMedicationPresets = useMemo(() => {
    const unique = new Map<string, MedicationEvent>();
    for (const event of [...events].sort(
      (left, right) => right.occurredAt - left.occurredAt,
    )) {
      if (
        event.kind !== 'medication' ||
        event.deletedAt !== undefined ||
        event.activeIngredient !== 'other'
      ) {
        continue;
      }
      unique.set(medicationIdentity(event), event);
      if (unique.size >= 4) {
        break;
      }
    }
    return [...unique.values()];
  }, [events]);

  if (!props.kind) {
    return null;
  }

  const context = domainContext(props.session);
  const selectedOccurredAt = timeEdited ? occurredAt : Date.now();
  const title =
    props.kind === 'feeding'
      ? strings.quickRecord.feedingTitle
      : props.kind === 'diaper'
        ? strings.quickRecord.diaperTitle
        : props.kind === 'sleep'
          ? strings.quickRecord.sleepTitle
          : props.kind === 'temperature'
            ? strings.quickRecord.temperatureTitle
            : strings.quickRecord.medicationTitle;
  const doseAmount = Number(doseAmountText);
  const minimumIntervalMinutes = Math.round(Number(intervalHoursText) * 60);
  const medicationInputValid =
    medicationName.trim().length > 0 &&
    Number.isFinite(doseAmount) &&
    doseAmount > 0 &&
    Number.isInteger(minimumIntervalMinutes) &&
    minimumIntervalMinutes >= 15 &&
    minimumIntervalMinutes <= 10_080;
  const medicationAssessment = medicationInputValid
    ? assessMedicationTiming(events, {
        occurredAt: selectedOccurredAt,
        medicationName,
        medicationCategory,
        activeIngredient,
        minimumIntervalMinutes,
      })
    : undefined;
  const medicationWarning = medicationAssessment?.sameMedication
    ? strings.quickRecord.medicationTooSoonWarning(
        medicationAssessment.sameMedication.medicationName,
      )
    : medicationAssessment?.otherAntipyretic
      ? strings.quickRecord.simultaneousAntipyreticWarning
      : undefined;
  const saveDisabled =
    (props.kind === 'feeding' &&
      feedingType === 'breast' &&
      elapsed.totalMs < 1_000) ||
    (props.kind === 'medication' && !medicationInputValid);
  const saveGuidance =
    props.kind === 'feeding' && saveDisabled
      ? strings.quickRecord.saveGuidance
      : props.kind === 'medication' && !medicationName.trim()
        ? strings.quickRecord.medicationNameRequired
        : props.kind === 'medication' &&
            (!Number.isFinite(doseAmount) || doseAmount <= 0)
          ? strings.quickRecord.medicationDoseRequired
          : props.kind === 'medication' && !medicationInputValid
            ? strings.quickRecord.intervalHint
            : undefined;
  const saveOpacity = saving ? 0.65 : 1;
  const timerAction = timerStartedAt
    ? strings.quickRecord.timerPause
    : elapsed.totalMs
      ? strings.quickRecord.timerResume
      : strings.quickRecord.timerStart;
  const timerActionLabel = strings.quickRecord.timerActionLabel(
    breastSide,
    timerAction,
  );

  const selectMedicationPreset = (
    selection: string,
    recent?: MedicationEvent,
  ) => {
    setMedicationPreset(selection);
    if (recent) {
      setMedicationName(recent.medicationName);
      setMedicationCategory(recent.medicationCategory);
      setActiveIngredient(recent.activeIngredient);
      setDoseAmountText(String(recent.doseAmount));
      setDoseUnit(recent.doseUnit);
      setIntervalHoursText(String(recent.minimumIntervalMinutes / 60));
      return;
    }
    setDoseAmountText('');
    setDoseUnit('ml');
    if (selection === 'acetaminophen') {
      setMedicationName(strings.quickRecord.medicationAcetaminophen);
      setMedicationCategory('antipyretic');
      setActiveIngredient('acetaminophen');
      setIntervalHoursText('4');
    } else if (selection === 'ibuprofen') {
      setMedicationName(strings.quickRecord.medicationIbuprofen);
      setMedicationCategory('antipyretic');
      setActiveIngredient('ibuprofen');
      setIntervalHoursText('6');
    } else {
      setMedicationName('');
      setMedicationCategory(selection === 'antibiotic' ? 'antibiotic' : 'other');
      setActiveIngredient('other');
      setIntervalHoursText('');
    }
  };

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
    } else if (props.kind === 'sleep') {
      input = {...context, kind: 'sleep', sleepType, startedAt: recordTime, note};
    } else if (props.kind === 'temperature') {
      input = {
        ...context,
        kind: 'temperature',
        temperatureCelsius,
        measurementSite,
        occurredAt: recordTime,
        note,
      };
    } else {
      const assessment = assessMedicationTiming(events, {
        occurredAt: recordTime,
        medicationName,
        medicationCategory,
        activeIngredient,
        minimumIntervalMinutes,
      });
      if (assessment.requiresAcknowledgement && !medicationWarningConfirmed) {
        setMedicationWarningConfirmed(true);
        return;
      }
      input = {
        ...context,
        kind: 'medication',
        medicationName,
        medicationCategory,
        activeIngredient,
        doseAmount,
        doseUnit,
        minimumIntervalMinutes,
        occurredAt: recordTime,
        note,
      };
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
      setErrorMessage(strings.quickRecord.saveFailed);
    } finally {
      saveRequestInFlight.current = false;
      setSaving(false);
    }
  };

  const scheduleText = (nextAt: number | undefined): string => {
    if (nextAt === undefined) {
      return strings.quickRecord.noPriorDose;
    }
    if (nextAt <= Date.now()) {
      return strings.quickRecord.doseReady;
    }
    return strings.quickRecord.nextDoseAt(
      new Intl.DateTimeFormat(strings.intlLocale, {
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(nextAt),
    );
  };

  return (
    <Modal animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet" visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.fill, {backgroundColor: props.theme.colors.background}]}>
        <View style={[styles.header, {borderBottomColor: props.theme.colors.border}]}>
          <Pressable accessibilityRole="button" onPress={props.onClose} style={styles.headerButton}>
            <Text style={[styles.headerAction, {color: props.theme.colors.textMuted}]}>
              {strings.common.close}
            </Text>
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
              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.typeLabel}
              </Text>
              <View style={styles.choiceRow}>
                <Choice label={strings.quickRecord.feedingBreast} onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="breast" />
                <Choice label={strings.quickRecord.feedingPumped} onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="bottle_breastmilk" />
                <Choice label={strings.quickRecord.feedingFormula} onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="formula" />
                <Choice label={strings.quickRecord.feedingSolid} onSelect={setFeedingType} selected={feedingType} theme={props.theme} value="solid" />
              </View>
              {feedingType === 'breast' ? (
                <View style={[styles.timerCard, {backgroundColor: props.theme.colors.surface}]}>
                  <Text style={[styles.timer, {color: props.theme.colors.text}]}>
                    {formatDuration(elapsed.totalMs / 1_000, strings)}
                  </Text>
                  <View style={styles.sideRow}>
                    <Choice
                      label={strings.quickRecord.leftWithDuration(
                        formatDuration(elapsed.leftMs / 1_000, strings),
                      )}
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
                      label={strings.quickRecord.rightWithDuration(
                        formatDuration(elapsed.rightMs / 1_000, strings),
                      )}
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
                      <Text style={styles.timerButtonText}>{timerAction}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={strings.quickRecord.timerResetLabel}
                      accessibilityRole="button"
                      onPress={() => {
                        setTimerStartedAt(undefined);
                        setActiveTimerSide(undefined);
                        setLeftAccumulatedMs(0);
                        setRightAccumulatedMs(0);
                      }}
                      style={[styles.resetButton, {borderColor: props.theme.colors.border}]}>
                      <Text style={[styles.resetText, {color: props.theme.colors.textMuted}]}>
                        {strings.common.reset}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[styles.label, {color: props.theme.colors.text}]}>
                    {strings.quickRecord.amountLabel}
                  </Text>
                  <View style={[styles.stepper, {backgroundColor: props.theme.colors.surface}]}>
                    <Pressable
                      accessibilityLabel={strings.quickRecord.decreaseVolumeLabel}
                      accessibilityRole="button"
                      onPress={() => setVolumeMl(value => Math.max(10, value - 10))}
                      style={[styles.stepButton, {borderColor: props.theme.colors.border}]}>
                      <Text style={[styles.stepText, {color: props.theme.colors.text}]}>−</Text>
                    </Pressable>
                    <View
                      accessibilityLabel={strings.quickRecord.volumeValueLabel(
                        volumeMl,
                      )}
                      accessibilityLiveRegion="polite"
                      accessible
                      style={styles.amount}>
                      <Text style={[styles.amountValue, {color: props.theme.colors.text}]}>{volumeMl}</Text>
                      <Text style={[styles.amountUnit, {color: props.theme.colors.textMuted}]}>ml</Text>
                    </View>
                    <Pressable
                      accessibilityLabel={strings.quickRecord.increaseVolumeLabel}
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
              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.diaperLabel}
              </Text>
              <View style={styles.choiceRow}>
                <Choice label={strings.quickRecord.diaperWet} onSelect={setDiaperType} selected={diaperType} theme={props.theme} value="wet" />
                <Choice label={strings.quickRecord.diaperDirty} onSelect={setDiaperType} selected={diaperType} theme={props.theme} value="dirty" />
                <Choice label={strings.quickRecord.diaperMixed} onSelect={setDiaperType} selected={diaperType} theme={props.theme} value="mixed" />
              </View>
            </>
          ) : null}

          {props.kind === 'sleep' ? (
            <>
              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.sleepTypeLabel}
              </Text>
              <View style={styles.choiceRow}>
                <Choice label={strings.quickRecord.sleepNap} onSelect={setSleepType} selected={sleepType} theme={props.theme} value="nap" />
                <Choice label={strings.quickRecord.sleepNight} onSelect={setSleepType} selected={sleepType} theme={props.theme} value="night" />
              </View>
              <View style={[styles.sleepNotice, {backgroundColor: props.theme.colors.primarySoft}]}>
                <Text style={styles.sleepIcon}>🌙</Text>
                <Text style={[styles.sleepText, {color: props.theme.colors.text}]}>
                  {strings.quickRecord.sleepNotice}
                </Text>
              </View>
            </>
          ) : null}

          {props.kind === 'temperature' ? (
            <>
              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.temperatureLabel}
              </Text>
              <View style={[styles.stepper, {backgroundColor: props.theme.colors.surface}]}>
                <Pressable
                  accessibilityLabel={strings.quickRecord.decreaseTemperatureLabel}
                  accessibilityRole="button"
                  onPress={() =>
                    setTemperatureCelsius(value =>
                      Math.max(30, Math.round((value - 0.1) * 10) / 10),
                    )
                  }
                  style={[styles.stepButton, {borderColor: props.theme.colors.border}]}>
                  <Text style={[styles.stepText, {color: props.theme.colors.text}]}>−</Text>
                </Pressable>
                <View
                  accessibilityLabel={strings.quickRecord.temperatureValueLabel(
                    temperatureCelsius,
                  )}
                  accessibilityLiveRegion="polite"
                  accessible
                  style={styles.amount}>
                  <Text style={[styles.amountValue, {color: props.theme.colors.text}]}>
                    {temperatureCelsius.toFixed(1)}
                  </Text>
                  <Text style={[styles.amountUnit, {color: props.theme.colors.textMuted}]}>°C</Text>
                </View>
                <Pressable
                  accessibilityLabel={strings.quickRecord.increaseTemperatureLabel}
                  accessibilityRole="button"
                  onPress={() =>
                    setTemperatureCelsius(value =>
                      Math.min(45, Math.round((value + 0.1) * 10) / 10),
                    )
                  }
                  style={[styles.stepButton, {borderColor: props.theme.colors.border}]}>
                  <Text style={[styles.stepText, {color: props.theme.colors.text}]}>＋</Text>
                </Pressable>
              </View>
              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.measurementSiteLabel}
              </Text>
              <View style={styles.choiceRow}>
                <Choice label={strings.quickRecord.siteArmpit} onSelect={setMeasurementSite} selected={measurementSite} theme={props.theme} value="armpit" />
                <Choice label={strings.quickRecord.siteEar} onSelect={setMeasurementSite} selected={measurementSite} theme={props.theme} value="ear" />
                <Choice label={strings.quickRecord.siteForehead} onSelect={setMeasurementSite} selected={measurementSite} theme={props.theme} value="forehead" />
                <Choice label={strings.quickRecord.siteOral} onSelect={setMeasurementSite} selected={measurementSite} theme={props.theme} value="oral" />
                <Choice label={strings.quickRecord.siteRectal} onSelect={setMeasurementSite} selected={measurementSite} theme={props.theme} value="rectal" />
                <Choice label={strings.quickRecord.siteOther} onSelect={setMeasurementSite} selected={measurementSite} theme={props.theme} value="other" />
              </View>
            </>
          ) : null}

          {props.kind === 'medication' ? (
            <>
              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.medicationPresetLabel}
              </Text>
              <View style={styles.choiceRow}>
                <Choice label={strings.quickRecord.medicationAcetaminophen} onSelect={selectMedicationPreset} selected={medicationPreset} theme={props.theme} value="acetaminophen" />
                <Choice label={strings.quickRecord.medicationIbuprofen} onSelect={selectMedicationPreset} selected={medicationPreset} theme={props.theme} value="ibuprofen" />
                <Choice label={strings.quickRecord.medicationAntibiotic} onSelect={selectMedicationPreset} selected={medicationPreset} theme={props.theme} value="antibiotic" />
                <Choice label={strings.quickRecord.medicationCustom} onSelect={selectMedicationPreset} selected={medicationPreset} theme={props.theme} value="custom" />
              </View>
              {recentMedicationPresets.length ? (
                <>
                  <Text style={[styles.subLabel, {color: props.theme.colors.textMuted}]}>
                    {strings.quickRecord.medicationRecent}
                  </Text>
                  <View style={styles.choiceRow}>
                    {recentMedicationPresets.map(event => {
                      const value = `recent:${event.id}`;
                      return (
                        <Choice
                          key={event.id}
                          label={event.medicationName}
                          onSelect={() => selectMedicationPreset(value, event)}
                          selected={medicationPreset}
                          theme={props.theme}
                          value={value}
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.medicationNameLabel}
              </Text>
              <TextInput
                maxLength={80}
                onChangeText={setMedicationName}
                placeholder={strings.quickRecord.medicationNamePlaceholder}
                placeholderTextColor={props.theme.colors.textMuted}
                style={[
                  styles.singleLineInput,
                  {
                    backgroundColor: props.theme.colors.surface,
                    borderColor: props.theme.colors.border,
                    color: props.theme.colors.text,
                  },
                ]}
                value={medicationName}
              />

              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.doseLabel}
              </Text>
              <View style={styles.doseRow}>
                <TextInput
                  keyboardType="decimal-pad"
                  maxLength={8}
                  onChangeText={setDoseAmountText}
                  placeholder={strings.quickRecord.doseAmountPlaceholder}
                  placeholderTextColor={props.theme.colors.textMuted}
                  style={[
                    styles.doseInput,
                    {
                      backgroundColor: props.theme.colors.surface,
                      borderColor: props.theme.colors.border,
                      color: props.theme.colors.text,
                    },
                  ]}
                  value={doseAmountText}
                />
                <View style={[styles.choiceRow, styles.doseUnits]}>
                  <Choice label="ml" onSelect={setDoseUnit} selected={doseUnit} theme={props.theme} value="ml" />
                  <Choice label="mg" onSelect={setDoseUnit} selected={doseUnit} theme={props.theme} value="mg" />
                  <Choice label={strings.intlLocale === 'ko-KR' ? '정' : 'tablet'} onSelect={setDoseUnit} selected={doseUnit} theme={props.theme} value="tablet" />
                  <Choice label={strings.intlLocale === 'ko-KR' ? '방울' : 'drops'} onSelect={setDoseUnit} selected={doseUnit} theme={props.theme} value="drop" />
                </View>
              </View>

              <Text style={[styles.label, {color: props.theme.colors.text}]}>
                {strings.quickRecord.intervalLabel}
              </Text>
              <View style={[styles.intervalRow, {backgroundColor: props.theme.colors.surface}]}>
                <TextInput
                  keyboardType="decimal-pad"
                  maxLength={6}
                  onChangeText={setIntervalHoursText}
                  placeholder="4"
                  placeholderTextColor={props.theme.colors.textMuted}
                  style={[styles.intervalInput, {color: props.theme.colors.text}]}
                  value={intervalHoursText}
                />
                <Text style={[styles.intervalUnit, {color: props.theme.colors.textMuted}]}>
                  {strings.quickRecord.intervalHours(1).replace('1', '')}
                </Text>
              </View>
              <Text style={[styles.fieldHint, {color: props.theme.colors.textMuted}]}>
                {strings.quickRecord.intervalHint}
              </Text>

              <View style={[styles.scheduleCard, {backgroundColor: props.theme.colors.surface}]}>
                <Text style={[styles.scheduleTitle, {color: props.theme.colors.text}]}>
                  {strings.quickRecord.antipyreticScheduleTitle}
                </Text>
                <Text style={[styles.scheduleLine, {color: props.theme.colors.textMuted}]}>
                  {strings.quickRecord.medicationAcetaminophen} ·{' '}
                  {scheduleText(nextMedicationTime(events, 'acetaminophen'))}
                </Text>
                <Text style={[styles.scheduleLine, {color: props.theme.colors.textMuted}]}>
                  {strings.quickRecord.medicationIbuprofen} ·{' '}
                  {scheduleText(nextMedicationTime(events, 'ibuprofen'))}
                </Text>
              </View>
              <View style={[styles.safetyCard, {backgroundColor: props.theme.colors.primarySoft}]}>
                <Text style={[styles.safetyText, {color: props.theme.colors.text}]}>
                  {strings.quickRecord.medicationSafetyNotice}
                </Text>
              </View>
              {medicationWarning ? (
                <Text accessibilityRole="alert" style={[styles.warning, {color: props.theme.colors.danger}]}>
                  {medicationWarning}
                </Text>
              ) : null}
            </>
          ) : null}

          <Text style={[styles.label, {color: props.theme.colors.text}]}>
            {strings.quickRecord.occurredAtLabel}
          </Text>
          <View style={[styles.timeRow, {backgroundColor: props.theme.colors.surface}]}>
            <View style={styles.timeCopy}>
              <Text style={[styles.timeValue, {color: props.theme.colors.text}]}>
                {new Intl.DateTimeFormat(strings.intlLocale, {
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(selectedOccurredAt)}
              </Text>
              <Text style={[styles.timeHint, {color: props.theme.colors.textMuted}]}>
                {strings.quickRecord.occurredAtHint}
              </Text>
            </View>
            <View style={styles.timeButtons}>
              <Pressable
                accessibilityLabel={strings.quickRecord.shiftBackLabel}
                accessibilityRole="button"
                onPress={() => {
                  setOccurredAt(selectedOccurredAt - 10 * 60_000);
                  setTimeEdited(true);
                }}
                style={[styles.smallButton, {borderColor: props.theme.colors.border}]}>
                <Text style={[styles.smallButtonText, {color: props.theme.colors.text}]}>
                  {strings.quickRecord.shiftBack}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={strings.quickRecord.setNowLabel}
                accessibilityRole="button"
                onPress={() => {
                  setOccurredAt(Date.now());
                  setTimeEdited(false);
                }}
                style={[styles.smallButton, {borderColor: props.theme.colors.border}]}>
                <Text style={[styles.smallButtonText, {color: props.theme.colors.text}]}>
                  {strings.common.now}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.label, {color: props.theme.colors.text}]}>
            {strings.quickRecord.noteLabel}
          </Text>
          <TextInput
            maxLength={500}
            multiline
            onChangeText={setNote}
            placeholder={strings.quickRecord.notePlaceholder}
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
          testID="quick-record-footer"
          style={[
            styles.footer,
            {
              borderTopColor: props.theme.colors.border,
              paddingBottom: Math.max(16, bottomInset + 8),
            },
          ]}>
          {errorMessage ? (
            <Text accessibilityRole="alert" style={[styles.error, {color: props.theme.colors.danger}]}>
              {errorMessage}
            </Text>
          ) : null}
          {saveGuidance ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.saveGuidance, {color: props.theme.colors.textMuted}]}>
              {saveGuidance}
            </Text>
          ) : null}
          <Pressable
            accessibilityHint={saveGuidance}
            accessibilityLabel={
              saving
                ? strings.quickRecord.savingLabel
                : medicationWarning && !medicationWarningConfirmed
                  ? strings.quickRecord.acknowledgeAndSave
                : strings.quickRecord.saveLabel
            }
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
            <Text style={styles.saveText}>
              {saving
                ? strings.quickRecord.saving
                : medicationWarning && !medicationWarningConfirmed
                  ? strings.quickRecord.acknowledgeAndSave
                  : strings.quickRecord.save}
            </Text>
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
  subLabel: {fontSize: 11, fontWeight: '700', marginBottom: 8, marginTop: 14},
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
  singleLineInput: {borderRadius: 15, borderWidth: 1, fontSize: 15, minHeight: 52, paddingHorizontal: 14},
  doseRow: {alignItems: 'flex-start', flexDirection: 'row', gap: 10},
  doseInput: {borderRadius: 15, borderWidth: 1, fontSize: 18, minHeight: 52, paddingHorizontal: 14, width: 105},
  doseUnits: {flex: 1},
  intervalRow: {alignItems: 'center', borderRadius: 15, flexDirection: 'row', maxWidth: 180, paddingHorizontal: 14},
  intervalInput: {fontSize: 18, fontWeight: '800', minHeight: 52, minWidth: 70},
  intervalUnit: {fontSize: 13, marginLeft: 5},
  fieldHint: {fontSize: 11, lineHeight: 17, marginTop: 7},
  scheduleCard: {borderRadius: 16, gap: 7, marginTop: 18, padding: 15},
  scheduleTitle: {fontSize: 13, fontWeight: '800'},
  scheduleLine: {fontSize: 12, lineHeight: 18},
  safetyCard: {borderRadius: 16, marginTop: 12, padding: 15},
  safetyText: {fontSize: 12, lineHeight: 19},
  warning: {fontSize: 12, fontWeight: '800', lineHeight: 19, marginTop: 12},
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
  saveGuidance: {fontSize: 11, marginBottom: 9, textAlign: 'center'},
  saveButton: {alignItems: 'center', borderRadius: 15, justifyContent: 'center', minHeight: 55},
  saveText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
});
