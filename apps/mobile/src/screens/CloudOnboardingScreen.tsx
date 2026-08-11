import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Strings } from '../app/i18n';
import { isValidBirthDate } from '../app/session';
import type { AppTheme } from '../app/theme';

type SetupMode = 'create' | 'join';
type Step = 'choose' | 'caregiver' | 'babyName' | 'birthDate' | 'inviteCode';

function isoCalendarDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromIso(value: string): Date {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) {
    return new Date();
  }
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

export function CloudOnboardingScreen(props: {
  readonly strings: Strings;
  readonly theme: AppTheme;
  readonly initialErrorMessage?: string;
  readonly onCreate: (input: {
    caregiverName: string;
    babyName: string;
    birthDate: string;
  }) => Promise<void>;
  readonly onJoin: (input: {
    caregiverName: string;
    code: string;
  }) => Promise<void>;
}) {
  const strings = props.strings;
  const [mode, setMode] = useState<SetupMode>();
  const [step, setStep] = useState<Step>('choose');
  const [caregiverName, setCaregiverName] = useState('');
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [code, setCode] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const submissionInFlight = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    props.initialErrorMessage,
  );

  const caregiverValid =
    caregiverName.trim().length > 0 && caregiverName.trim().length <= 80;
  const babyNameValid =
    babyName.trim().length > 0 && babyName.trim().length <= 80;
  const codeValid = /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  const totalSteps = mode === 'create' ? 3 : 2;
  const currentStep =
    step === 'caregiver'
      ? 1
      : step === 'babyName' || step === 'inviteCode'
      ? 2
      : step === 'birthDate'
      ? 3
      : undefined;

  const fieldStyle = [
    styles.input,
    {
      backgroundColor: props.theme.colors.surface,
      borderColor: props.theme.colors.border,
      color: props.theme.colors.text,
    },
  ];

  const chooseMode = (nextMode: SetupMode) => {
    setMode(nextMode);
    setStep('caregiver');
    setErrorMessage(undefined);
  };

  const next = async () => {
    if (submissionInFlight.current || saving) {
      return;
    }
    setErrorMessage(undefined);
    if (step === 'caregiver' && caregiverValid) {
      setStep(mode === 'create' ? 'babyName' : 'inviteCode');
      return;
    }
    if (step === 'babyName' && babyNameValid) {
      setStep('birthDate');
      return;
    }
    if (step === 'birthDate' && isValidBirthDate(birthDate)) {
      submissionInFlight.current = true;
      setSaving(true);
      try {
        await props.onCreate({ caregiverName, babyName, birthDate });
      } catch {
        setErrorMessage(strings.onboarding.createFailed);
      } finally {
        submissionInFlight.current = false;
        setSaving(false);
      }
      return;
    }
    if (step === 'inviteCode' && codeValid) {
      submissionInFlight.current = true;
      setSaving(true);
      try {
        await props.onJoin({ caregiverName, code });
      } catch {
        setErrorMessage(strings.onboarding.joinFailed);
      } finally {
        submissionInFlight.current = false;
        setSaving(false);
      }
    }
  };

  const back = () => {
    setErrorMessage(undefined);
    setShowDatePicker(false);
    if (step === 'caregiver') {
      setMode(undefined);
      setStep('choose');
    } else if (step === 'babyName' || step === 'inviteCode') {
      setStep('caregiver');
    } else if (step === 'birthDate') {
      setStep('babyName');
    }
  };

  const actionEnabled = useMemo(() => {
    if (step === 'caregiver') return caregiverValid;
    if (step === 'babyName') return babyNameValid;
    if (step === 'birthDate') return isValidBirthDate(birthDate);
    if (step === 'inviteCode') return codeValid;
    return false;
  }, [babyNameValid, birthDate, caregiverValid, codeValid, step]);

  const actionLabel = saving
    ? strings.onboarding.preparing
    : step === 'birthDate'
    ? strings.onboarding.createAction
    : step === 'inviteCode'
    ? strings.onboarding.joinAction
    : strings.common.next;

  return (
    <SafeAreaView
      testID="cloud-onboarding-safe-area"
      style={[styles.fill, { backgroundColor: props.theme.colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View
          style={[
            styles.mark,
            { backgroundColor: props.theme.colors.primarySoft },
          ]}
        >
          <Text style={styles.markEmoji}>🌿</Text>
        </View>
        <Text style={[styles.eyebrow, { color: props.theme.colors.primary }]}>
          {strings.onboarding.eyebrow}
        </Text>

        {step === 'choose' ? (
          <>
            <Text style={[styles.title, { color: props.theme.colors.text }]}>
              {strings.onboarding.chooseTitle}
            </Text>
            <Text
              style={[styles.subtitle, { color: props.theme.colors.textMuted }]}
            >
              {strings.onboarding.chooseSubtitle}
            </Text>
            <View
              testID="onboarding-benefits"
              style={[
                styles.benefits,
                {
                  backgroundColor: props.theme.colors.surface,
                  borderColor: props.theme.colors.border,
                },
              ]}
            >
              {[
                { icon: '⚡️', title: strings.onboarding.quickBenefitTitle },
                { icon: '🤝', title: strings.onboarding.handoffBenefitTitle },
                { icon: '🔒', title: strings.onboarding.privateBenefitTitle },
              ].map(benefit => (
                <View key={benefit.title} style={styles.benefitItem}>
                  <Text style={styles.benefitIcon}>{benefit.icon}</Text>
                  <Text
                    style={[
                      styles.benefitTitle,
                      { color: props.theme.colors.text },
                    ]}
                  >
                    {benefit.title}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.choiceList}>
              <Pressable
                accessibilityLabel={strings.onboarding.createChoiceTitle}
                accessibilityRole="button"
                onPress={() => chooseMode('create')}
                style={[
                  styles.choice,
                  {
                    backgroundColor: props.theme.colors.surface,
                    borderColor: props.theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.choiceTitle,
                    { color: props.theme.colors.text },
                  ]}
                >
                  {strings.onboarding.createChoiceTitle}
                </Text>
                <Text
                  style={[
                    styles.choiceDescription,
                    { color: props.theme.colors.textMuted },
                  ]}
                >
                  {strings.onboarding.createChoiceDescription}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={strings.onboarding.joinChoiceTitle}
                accessibilityRole="button"
                onPress={() => chooseMode('join')}
                style={[
                  styles.choice,
                  {
                    backgroundColor: props.theme.colors.surface,
                    borderColor: props.theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.choiceTitle,
                    { color: props.theme.colors.text },
                  ]}
                >
                  {strings.onboarding.joinChoiceTitle}
                </Text>
                <Text
                  style={[
                    styles.choiceDescription,
                    { color: props.theme.colors.textMuted },
                  ]}
                >
                  {strings.onboarding.joinChoiceDescription}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text
              style={[styles.progress, { color: props.theme.colors.textMuted }]}
            >
              {currentStep} / {totalSteps}
            </Text>
            <Text style={[styles.title, { color: props.theme.colors.text }]}>
              {step === 'caregiver'
                ? strings.onboarding.caregiverTitle
                : step === 'babyName'
                ? strings.onboarding.babyNameTitle
                : step === 'birthDate'
                ? strings.onboarding.birthDateTitle
                : strings.onboarding.inviteCodeTitle}
            </Text>
            <Text
              style={[styles.subtitle, { color: props.theme.colors.textMuted }]}
            >
              {step === 'caregiver'
                ? strings.onboarding.caregiverSubtitle
                : step === 'babyName'
                ? strings.onboarding.babyNameSubtitle
                : step === 'birthDate'
                ? strings.onboarding.birthDateSubtitle
                : strings.onboarding.inviteCodeSubtitle}
            </Text>
            <View style={styles.fieldArea}>
              {step === 'caregiver' ? (
                <TextInput
                  accessibilityLabel={strings.onboarding.caregiverLabel}
                  autoCapitalize="words"
                  autoFocus
                  maxLength={80}
                  onChangeText={setCaregiverName}
                  placeholder={strings.onboarding.caregiverPlaceholder}
                  placeholderTextColor={props.theme.colors.textMuted}
                  style={fieldStyle}
                  value={caregiverName}
                />
              ) : null}
              {step === 'babyName' ? (
                <TextInput
                  accessibilityLabel={strings.onboarding.babyNameLabel}
                  autoFocus
                  maxLength={80}
                  onChangeText={setBabyName}
                  placeholder={strings.onboarding.babyNamePlaceholder}
                  placeholderTextColor={props.theme.colors.textMuted}
                  style={fieldStyle}
                  value={babyName}
                />
              ) : null}
              {step === 'birthDate' ? (
                <>
                  <Pressable
                    accessibilityLabel={strings.onboarding.birthDateLabel}
                    accessibilityRole="button"
                    onPress={() => setShowDatePicker(true)}
                    style={[fieldStyle, styles.dateButton]}
                  >
                    <Text
                      style={[
                        styles.dateValue,
                        {
                          color: birthDate
                            ? props.theme.colors.text
                            : props.theme.colors.textMuted,
                        },
                      ]}
                    >
                      {birthDate || strings.onboarding.birthDatePlaceholder}
                    </Text>
                    <Text
                      style={[
                        styles.dateHint,
                        { color: props.theme.colors.primary },
                      ]}
                    >
                      {strings.onboarding.birthDatePick}
                    </Text>
                  </Pressable>
                  {showDatePicker ? (
                    <DateTimePicker
                      maximumDate={new Date()}
                      mode="date"
                      onChange={(_event, selectedDate) => {
                        if (Platform.OS === 'android') setShowDatePicker(false);
                        if (selectedDate)
                          setBirthDate(isoCalendarDate(selectedDate));
                      }}
                      value={dateFromIso(birthDate)}
                    />
                  ) : null}
                </>
              ) : null}
              {step === 'inviteCode' ? (
                <TextInput
                  accessibilityLabel={strings.onboarding.inviteCodeLabel}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus
                  maxLength={6}
                  onChangeText={value =>
                    setCode(value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ''))
                  }
                  placeholder="ABC234"
                  placeholderTextColor={props.theme.colors.textMuted}
                  style={[fieldStyle, styles.codeInput]}
                  value={code}
                />
              ) : null}
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityLabel={strings.common.back}
                accessibilityRole="button"
                onPress={back}
                style={[
                  styles.backButton,
                  { borderColor: props.theme.colors.border },
                ]}
              >
                <Text
                  style={[styles.backText, { color: props.theme.colors.text }]}
                >
                  {strings.common.back}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={actionLabel}
                accessibilityRole="button"
                accessibilityState={{
                  busy: saving,
                  disabled: !actionEnabled || saving,
                }}
                disabled={!actionEnabled || saving}
                onPress={next}
                style={({ pressed }) => [
                  styles.nextButton,
                  {
                    backgroundColor: actionEnabled
                      ? props.theme.colors.primary
                      : props.theme.colors.border,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <Text style={styles.buttonText}>{actionLabel}</Text>
              </Pressable>
            </View>
          </>
        )}
        {errorMessage ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: props.theme.colors.danger }]}
          >
            {errorMessage}
          </Text>
        ) : null}
        <Text style={[styles.notice, { color: props.theme.colors.textMuted }]}>
          {strings.onboarding.notice}
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingBottom: 36,
    paddingHorizontal: 24,
    paddingTop: 38,
  },
  mark: {
    alignItems: 'center',
    borderRadius: 24,
    height: 68,
    justifyContent: 'center',
    marginBottom: 24,
    width: 68,
  },
  markEmoji: { fontSize: 34 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  progress: { fontSize: 13, fontWeight: '800', marginTop: 30 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1.2, marginTop: 8 },
  subtitle: { fontSize: 15, lineHeight: 23, marginTop: 12 },
  benefits: {
    alignItems: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 8,
    paddingVertical: 13,
  },
  benefitItem: { alignItems: 'center', flex: 1, justifyContent: 'flex-start' },
  benefitIcon: { fontSize: 20 },
  benefitTitle: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    marginTop: 5,
    textAlign: 'center',
  },
  choiceList: { gap: 10, marginTop: 16 },
  choice: { borderRadius: 18, borderWidth: 1, padding: 20 },
  choiceTitle: { fontSize: 17, fontWeight: '800' },
  choiceDescription: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  fieldArea: { marginTop: 38 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  dateButton: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateValue: { fontSize: 16, fontWeight: '700' },
  dateHint: { fontSize: 14, fontWeight: '800' },
  codeInput: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 5,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  backButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    width: 88,
  },
  backText: { fontSize: 16, fontWeight: '800' },
  nextButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  error: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 11,
    textAlign: 'center',
  },
  notice: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: 'auto',
    paddingTop: 20,
    textAlign: 'center',
  },
});
