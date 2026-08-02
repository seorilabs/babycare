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

import { isValidBirthDate } from '../app/session';
import type { AppTheme } from '../app/theme';

type SetupMode = 'create' | 'join';
type Step = 'choose' | 'caregiver' | 'babyName' | 'birthDate' | 'inviteCode';

const CREATE_FAILURE_MESSAGE =
  '돌봄 그룹을 만들지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
const JOIN_FAILURE_MESSAGE =
  '돌봄 그룹에 참여하지 못했어요. 코드를 확인하거나 새 코드를 요청해 주세요.';

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
        setErrorMessage(CREATE_FAILURE_MESSAGE);
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
        setErrorMessage(JOIN_FAILURE_MESSAGE);
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
    ? '공동 기록을 준비하는 중…'
    : step === 'birthDate'
    ? '돌봄 그룹 만들기'
    : step === 'inviteCode'
    ? '돌봄 그룹 참여하기'
    : '다음';

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
          함께봄 공동 기록
        </Text>

        {step === 'choose' ? (
          <>
            <Text style={[styles.title, { color: props.theme.colors.text }]}>
              함께 돌보는 오늘
            </Text>
            <Text
              style={[styles.subtitle, { color: props.theme.colors.textMuted }]}
            >
              처음이라면 돌봄 그룹을 만들고,{`\n`}초대 코드를 받았다면 바로
              참여할 수 있어요.
            </Text>
            <View style={styles.choiceList}>
              <Pressable
                accessibilityLabel="처음 시작하기"
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
                  처음 시작하기
                </Text>
                <Text
                  style={[
                    styles.choiceDescription,
                    { color: props.theme.colors.textMuted },
                  ]}
                >
                  내 아기의 첫 돌봄 그룹을 만들어요
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="초대 코드로 참여"
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
                  초대 코드로 참여
                </Text>
                <Text
                  style={[
                    styles.choiceDescription,
                    { color: props.theme.colors.textMuted },
                  ]}
                >
                  가족이 만든 그룹에 함께 기록해요
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
                ? '어떻게 불러드릴까요?'
                : step === 'babyName'
                ? '아기 이름을 알려주세요'
                : step === 'birthDate'
                ? '아기는 언제 태어났나요?'
                : '초대 코드를 입력해 주세요'}
            </Text>
            <Text
              style={[styles.subtitle, { color: props.theme.colors.textMuted }]}
            >
              {step === 'caregiver'
                ? '함께 기록할 때 표시되는 이름이에요.'
                : step === 'babyName'
                ? '돌봄 그룹에서 사용할 아기 이름이에요.'
                : step === 'birthDate'
                ? '정확한 날짜는 성장 기록을 이해하는 데 도움이 돼요.'
                : '그룹 소유자에게 받은 6자리 코드예요.'}
            </Text>
            <View style={styles.fieldArea}>
              {step === 'caregiver' ? (
                <TextInput
                  accessibilityLabel="양육자 이름"
                  autoCapitalize="words"
                  autoFocus
                  maxLength={80}
                  onChangeText={setCaregiverName}
                  placeholder="예: 엄마, 아빠, 할머니"
                  placeholderTextColor={props.theme.colors.textMuted}
                  style={fieldStyle}
                  value={caregiverName}
                />
              ) : null}
              {step === 'babyName' ? (
                <TextInput
                  accessibilityLabel="아기 이름"
                  autoFocus
                  maxLength={80}
                  onChangeText={setBabyName}
                  placeholder="예: 지안"
                  placeholderTextColor={props.theme.colors.textMuted}
                  style={fieldStyle}
                  value={babyName}
                />
              ) : null}
              {step === 'birthDate' ? (
                <>
                  <Pressable
                    accessibilityLabel="아기 생년월일"
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
                      {birthDate || '날짜 선택'}
                    </Text>
                    <Text
                      style={[
                        styles.dateHint,
                        { color: props.theme.colors.primary },
                      ]}
                    >
                      선택
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
                  accessibilityLabel="초대 코드"
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
                accessibilityLabel="이전"
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
                  이전
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
          앱을 삭제하거나 기기를 바꾸면 현재 계정과 기록에 다시 접근하지 못할 수
          있어요.
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
  choiceList: { gap: 12, marginTop: 32 },
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
