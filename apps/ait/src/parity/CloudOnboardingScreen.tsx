import {BirthDatePicker} from '../components/birth-date-picker';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  looksLikeInviteCodePaste,
  sanitizeInviteCodeInput,
  type AnalyticsPort,
  type BabyCareAnalyticsEvent,
  type OnboardingMode,
  type OnboardingStep,
} from '../../../../packages/product-core/src/index.ts';

import type {Strings} from '@babycare/product-ui';
import {isValidBirthDate} from './session';
import type {AppTheme} from '@babycare/product-ui';

type SetupMode = 'create' | 'join';
type Step = 'choose' | 'caregiver' | 'babyName' | 'birthDate' | 'inviteCode';

export function CloudOnboardingScreen(props: {
  readonly strings: Strings;
  readonly theme: AppTheme;
  readonly initialErrorMessage?: string;
  readonly analytics?: AnalyticsPort;
  readonly onCreate: (input: {caregiverName: string; babyName: string; birthDate: string;}) => Promise<void>;
  readonly onJoin: (input: {caregiverName: string; code: string;}) => Promise<void>;
}) {
  const strings = props.strings;
  const [mode, setMode] = useState<SetupMode>();
  const [step, setStep] = useState<Step>('choose');
  const [caregiverName, setCaregiverName] = useState('');
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const submissionInFlight = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(props.initialErrorMessage,);
  const lastTrackedStep = useRef<string | undefined>(undefined);
  const analyticsMode: OnboardingMode = mode ?? 'none';
  const track = useCallback((event: BabyCareAnalyticsEvent) => {
    props.analytics?.track(event).catch(() => undefined);
  }, [props.analytics],);
  useEffect(() => {
    const key = `${step}:${analyticsMode}`;
    if (lastTrackedStep.current === key) {
      return;
    }
    lastTrackedStep.current = key;
    track({name: 'bc_onboarding_step_view', params: {step: step as OnboardingStep, mode: analyticsMode}});
  }, [analyticsMode, step, track]);
  const caregiverValid = caregiverName.trim().length > 0 && caregiverName.trim().length <= 80;
  const babyNameValid = babyName.trim().length > 0 && babyName.trim().length <= 80;
  const codeValid = /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  const totalSteps = mode === 'create' ? 3 : 2;
  const currentStep = step === 'caregiver' ? 1 : step === 'babyName' || step === 'inviteCode' ? 2 : step === 'birthDate' ? 3 : undefined;
  const fieldStyle = [styles.input, {backgroundColor: props.theme.colors.surface, borderColor: props.theme.colors.border, color: props.theme.colors.text}];

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
        await props.onCreate({caregiverName, babyName, birthDate});
      } catch {
        track({name: 'bc_onboarding_step_blocked', params: {step, mode: analyticsMode, reason: 'save_failed'}});
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
        await props.onJoin({caregiverName, code});
      } catch {
        track({name: 'bc_onboarding_step_blocked', params: {step, mode: analyticsMode, reason: 'save_failed'}});
        setErrorMessage(strings.onboarding.joinFailed);
      } finally {
        submissionInFlight.current = false;
        setSaving(false);
      }
      return;
    }
    track({name: 'bc_onboarding_step_blocked', params: {step: step as OnboardingStep, mode: analyticsMode, reason: 'invalid_input'}});
  };
  const back = () => {
    track({name: 'bc_onboarding_step_back', params: {step: step as OnboardingStep, mode: analyticsMode}});
    setErrorMessage(undefined);
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

  const actionLabel = saving ? strings.onboarding.preparing : step === 'birthDate' ? strings.onboarding.createAction : step === 'inviteCode' ? strings.onboarding.joinAction : strings.common.next;

  return (
    <SafeAreaView testID="cloud-onboarding-safe-area" style={[styles.fill, {backgroundColor: props.theme.colors.background}]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.mark, {backgroundColor: props.theme.colors.primarySoft}]}>
          <Text style={styles.markEmoji}>🌿</Text>
        </View>
        <Text style={[styles.eyebrow, {color: props.theme.colors.primary}]}>
          {strings.onboarding.eyebrow}
        </Text>

        {step === 'choose' ? (
          <>
            <Text style={[styles.title, {color: props.theme.colors.text}]}>
              {strings.onboarding.chooseTitle}
            </Text>
            <Text
              style={[styles.subtitle, {color: props.theme.colors.textMuted}]}
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
                {icon: '⚡️', title: strings.onboarding.quickBenefitTitle},
                {icon: '🤝', title: strings.onboarding.handoffBenefitTitle},
                {icon: '🔒', title: strings.onboarding.privateBenefitTitle},
              ].map(benefit => (
                <View key={benefit.title} style={styles.benefitItem}>
                  <Text style={styles.benefitIcon}>{benefit.icon}</Text>
                  <Text
                    style={[
                      styles.benefitTitle,
                      {color: props.theme.colors.text},
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
                    {color: props.theme.colors.text},
                  ]}
                >
                  {strings.onboarding.createChoiceTitle}
                </Text>
                <Text
                  style={[
                    styles.choiceDescription,
                    {color: props.theme.colors.textMuted},
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
                    {color: props.theme.colors.text},
                  ]}
                >
                  {strings.onboarding.joinChoiceTitle}
                </Text>
                <Text
                  style={[
                    styles.choiceDescription,
                    {color: props.theme.colors.textMuted},
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
              style={[styles.progress, {color: props.theme.colors.textMuted}]}
            >
              {currentStep} / {totalSteps}
            </Text>
            <Text style={[styles.title, {color: props.theme.colors.text}]}>
              {step === 'caregiver'
                ? strings.onboarding.caregiverTitle
                : step === 'babyName'
                ? strings.onboarding.babyNameTitle
                : step === 'birthDate'
                ? strings.onboarding.birthDateTitle
                : strings.onboarding.inviteCodeTitle}
            </Text>
            <Text
              style={[styles.subtitle, {color: props.theme.colors.textMuted}]}
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
              {step === 'birthDate' ? <BirthDatePicker onChange={setBirthDate} value={birthDate} /> : null}
              {step === 'inviteCode' ? (
                <TextInput
                  accessibilityLabel={strings.onboarding.inviteCodeLabel}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus
                  onChangeText={value => {
                    setErrorMessage(undefined);
                    const sanitized = sanitizeInviteCodeInput(value);
                    if (looksLikeInviteCodePaste(value) && sanitized.length < 6) {
                      setCode('');
                      setErrorMessage(strings.onboarding.inviteCodeNotFound);
                      return;
                    }
                    setCode(sanitized);
                  }}
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
                  {borderColor: props.theme.colors.border},
                ]}
              >
                <Text
                  style={[styles.backText, {color: props.theme.colors.text}]}
                >
                  {strings.common.back}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={actionLabel}
                accessibilityRole="button"
                accessibilityState={{
                  busy: saving,
                  disabled: saving,
                }}
                disabled={saving}
                onPress={next}
                style={({pressed}) => [
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
            style={[styles.error, {color: props.theme.colors.danger}]}
          >
            {errorMessage}
          </Text>
        ) : null}
        <Text style={[styles.notice, {color: props.theme.colors.textMuted}]}>
          {strings.onboarding.notice}
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
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
  markEmoji: {fontSize: 34},
  eyebrow: {fontSize: 11, fontWeight: '800', letterSpacing: 1.5},
  progress: {fontSize: 13, fontWeight: '800', marginTop: 30},
  title: {fontSize: 32, fontWeight: '800', letterSpacing: -1.2, marginTop: 8},
  subtitle: {fontSize: 15, lineHeight: 23, marginTop: 12},
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
  benefitItem: {alignItems: 'center', flex: 1, justifyContent: 'flex-start'},
  benefitIcon: {fontSize: 20},
  benefitTitle: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    marginTop: 5,
    textAlign: 'center',
  },
  choiceList: {gap: 10, marginTop: 16},
  choice: {borderRadius: 18, borderWidth: 1, padding: 20},
  choiceTitle: {fontSize: 17, fontWeight: '800'},
  choiceDescription: {fontSize: 13, lineHeight: 20, marginTop: 6},
  fieldArea: {marginTop: 38},
  input: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  codeInput: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 5,
    textAlign: 'center',
  },
  actions: {flexDirection: 'row', gap: 10, marginTop: 24},
  backButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    width: 88,
  },
  backText: {fontSize: 16, fontWeight: '800'},
  nextButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
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
