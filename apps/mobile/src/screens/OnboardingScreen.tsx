import {useMemo, useState} from 'react';
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

import type {AppTheme} from '@babycare/product-ui';
import {isValidBirthDate} from '../app/session';

export function OnboardingScreen(props: {
  readonly theme: AppTheme;
  readonly onComplete: (input: {
    caregiverName: string;
    babyName: string;
    birthDate: string;
  }) => Promise<void>;
}) {
  const [caregiverName, setCaregiverName] = useState('');
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const valid = useMemo(
    () =>
      caregiverName.trim().length > 0 &&
      caregiverName.trim().length <= 80 &&
      babyName.trim().length > 0 &&
      babyName.trim().length <= 80 &&
      isValidBirthDate(birthDate),
    [babyName, birthDate, caregiverName],
  );

  const fieldStyle = [
    styles.input,
    {
      backgroundColor: props.theme.colors.surface,
      borderColor: props.theme.colors.border,
      color: props.theme.colors.text,
    },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, {backgroundColor: props.theme.colors.background}]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={[styles.mark, {backgroundColor: props.theme.colors.primarySoft}]}>
          <Text style={styles.markEmoji}>🌿</Text>
        </View>
        <Text style={[styles.eyebrow, {color: props.theme.colors.primary}]}>LOCAL PREVIEW</Text>
        <Text style={[styles.title, {color: props.theme.colors.text}]}>함께 돌보는 오늘</Text>
        <Text style={[styles.subtitle, {color: props.theme.colors.textMuted}]}>
          이 기기에서 마지막 수유와 기저귀, 수면을{`\n`}한눈에 확인합니다.
        </Text>

        <View style={[styles.promise, {backgroundColor: props.theme.colors.surface}]}>
          <Text style={styles.promiseIcon}>⚡</Text>
          <View style={styles.promiseCopy}>
            <Text style={[styles.promiseTitle, {color: props.theme.colors.text}]}>한 손으로 10초 기록</Text>
            <Text style={[styles.promiseText, {color: props.theme.colors.textMuted}]}>
              이 기기에 바로 저장해요. 공동 기록은 Firebase 연결 후 활성화됩니다.
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, {color: props.theme.colors.text}]}>내 이름</Text>
          <TextInput
            accessibilityLabel="양육자 이름"
            autoCapitalize="words"
            maxLength={80}
            onChangeText={setCaregiverName}
            placeholder="예: 엄마, 아빠, 할머니"
            placeholderTextColor={props.theme.colors.textMuted}
            style={fieldStyle}
            value={caregiverName}
          />
          <Text style={[styles.label, {color: props.theme.colors.text}]}>아기 이름</Text>
          <TextInput
            accessibilityLabel="아기 이름"
            maxLength={80}
            onChangeText={setBabyName}
            placeholder="예: 지안"
            placeholderTextColor={props.theme.colors.textMuted}
            style={fieldStyle}
            value={babyName}
          />
          <Text style={[styles.label, {color: props.theme.colors.text}]}>생년월일</Text>
          <TextInput
            accessibilityLabel="아기 생년월일"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onChangeText={setBirthDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={props.theme.colors.textMuted}
            style={fieldStyle}
            value={birthDate}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!valid || saving}
          onPress={async () => {
            setSaving(true);
            setErrorMessage(undefined);
            try {
              await props.onComplete({caregiverName, babyName, birthDate});
            } catch {
              setErrorMessage('이 기기에 프로필을 저장하지 못했어요. 다시 시도해 주세요.');
            } finally {
              setSaving(false);
            }
          }}
          style={({pressed}) => [
            styles.button,
            {
              backgroundColor: valid ? props.theme.colors.primary : props.theme.colors.border,
              opacity: pressed ? 0.82 : 1,
            },
          ]}>
          <Text style={styles.buttonText}>{saving ? '준비하는 중…' : '돌봄 기록 시작하기'}</Text>
        </Pressable>
        {errorMessage ? (
          <Text accessibilityRole="alert" style={[styles.error, {color: props.theme.colors.danger}]}>
            {errorMessage}
          </Text>
        ) : null}
        <Text style={[styles.notice, {color: props.theme.colors.textMuted}]}>
          의료 판단 도구가 아닌 양육자 간 돌봄 기록·공유 도구입니다.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  content: {paddingBottom: 36, paddingHorizontal: 24, paddingTop: 42},
  mark: {
    alignItems: 'center',
    borderRadius: 24,
    height: 68,
    justifyContent: 'center',
    marginBottom: 26,
    width: 68,
  },
  markEmoji: {fontSize: 34},
  eyebrow: {fontSize: 12, fontWeight: '800', letterSpacing: 2.2},
  title: {fontSize: 32, fontWeight: '800', letterSpacing: -1.2, marginTop: 8},
  subtitle: {fontSize: 16, lineHeight: 25, marginTop: 13},
  promise: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    marginTop: 28,
    padding: 16,
  },
  promiseIcon: {fontSize: 26, marginRight: 13},
  promiseCopy: {flex: 1},
  promiseTitle: {fontSize: 15, fontWeight: '700'},
  promiseText: {fontSize: 13, lineHeight: 19, marginTop: 3},
  form: {marginTop: 30},
  label: {fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 14},
  input: {borderRadius: 14, borderWidth: 1, fontSize: 16, minHeight: 52, paddingHorizontal: 16},
  button: {alignItems: 'center', borderRadius: 16, marginTop: 26, minHeight: 56, justifyContent: 'center'},
  buttonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'},
  error: {fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center'},
  notice: {fontSize: 11, lineHeight: 17, marginTop: 15, textAlign: 'center'},
});
