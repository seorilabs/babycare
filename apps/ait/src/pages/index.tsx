import {createRoute} from '@granite-js/react-native';
import {Button} from '@toss/tds-react-native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
  BirthDatePicker,
  isSelectableBirthDate,
} from '../components/birth-date-picker';
import {ParityDashboard} from '../components/parity-dashboard';
import {
  bootstrapCareSession,
  createCareGroup,
  joinCareGroup,
  type ReadyCareSession,
} from '../services/babycare-backend';
import {babycareAnalytics} from '../services/analytics';

export const Route = createRoute('/', {component: BabyNestHome});

type InputFocusHandler = NonNullable<
  React.ComponentProps<typeof TextInput>['onFocus']
>;
type KeyboardScrollTarget = Parameters<
  ScrollView['scrollResponderScrollNativeHandleToKeyboard']
>[0];

function useKeyboardAwareScroll() {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const focusedInputRef = useRef<KeyboardScrollTarget | null>(null);

  const revealFocusedInput = useCallback(() => {
    if (focusedInputRef.current === null) {
      return;
    }
    scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard(
      focusedInputRef.current,
      24,
      true,
    );
  }, []);

  useEffect(() => {
    const subscription = Keyboard.addListener(
      'keyboardDidShow',
      revealFocusedInput,
    );
    return () => subscription.remove();
  }, [revealFocusedInput]);

  const onInputFocus = useCallback<InputFocusHandler>(
    event => {
      focusedInputRef.current = event.target;
      requestAnimationFrame(revealFocusedInput);
    },
    [revealFocusedInput],
  );

  return {scrollViewRef, onInputFocus};
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
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
    <Button
      accessibilityRole="button"
      disabled={disabled}
      display="block"
      onPress={onPress}
      size="large"
      style={tone === 'secondary' ? 'weak' : 'fill'}
      type={tone === 'danger' ? 'danger' : 'primary'}>
      {label}
    </Button>
  );
}

function Onboarding({
  onReady,
}: {
  readonly onReady: (value: ReadyCareSession) => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [caregiverName, setCaregiverName] = useState('');
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const {scrollViewRef, onInputFocus} = useKeyboardAwareScroll();

  const submit = useCallback(async () => {
    if (!caregiverName.trim()) {
      setError('양육자 이름을 입력해 주세요.');
      return;
    }
    if (
      mode === 'create' &&
      (!babyName.trim() || !isSelectableBirthDate(birthDate, new Date()))
    ) {
      setError('아기 이름과 생년월일을 확인해 주세요.');
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'android' ? 'height' : undefined}
      style={styles.fill}>
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={styles.onboardingContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        ref={scrollViewRef}>
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
            style={[
              styles.segmentButton,
              mode === 'create' && styles.segmentSelected,
            ]}>
            <Text
              style={
                mode === 'create'
                  ? styles.segmentSelectedText
                  : styles.segmentText
              }>
              새 돌봄 시작
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMode('join')}
            style={[
              styles.segmentButton,
              mode === 'join' && styles.segmentSelected,
            ]}>
            <Text
              style={
                mode === 'join'
                  ? styles.segmentSelectedText
                  : styles.segmentText
              }>
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
            onFocus={onInputFocus}
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
                onFocus={onInputFocus}
                placeholder="예: 지안"
                placeholderTextColor="#8A9A94"
                style={styles.input}
                value={babyName}
              />
              <Text style={styles.fieldLabel}>생년월일</Text>
              <BirthDatePicker onChange={setBirthDate} value={birthDate} />
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>초대 코드</Text>
              <TextInput
                accessibilityLabel="초대 코드"
                autoCapitalize="characters"
                maxLength={6}
                onChangeText={setInviteCode}
                onFocus={onInputFocus}
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
            label={
              busy
                ? '연결 중…'
                : mode === 'create'
                  ? '함께봄 시작하기'
                  : '돌봄 그룹 참여하기'
            }
            onPress={() => void submit()}
          />
        </View>
        <Text style={styles.disclaimer}>
          함께봄은 성인 양육자용 기록 도구이며 의료 판단이나 진단을 제공하지 않습니다.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function BabyNestHome() {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState<ReadyCareSession>();
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

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <ActivityIndicator color="#397663" size="large" />
        <Text style={styles.loadingText}>돌봄 기록을 불러오는 중이에요.</Text>
      </SafeAreaView>
    );
  }

  if (ready) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ParityDashboard
          initialReady={ready}
          onDeleted={() => setReady(undefined)}
        />
      </SafeAreaView>
    );
  }

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

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#F5F8F6'},
  fill: {flex: 1},
  centered: {
    alignItems: 'center',
    backgroundColor: '#F5F8F6',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
  },
  loadingText: {color: '#536962', fontSize: 15},
  onboardingContent: {
    flexGrow: 1,
    gap: 18,
    padding: 20,
    paddingBottom: 40,
  },
  hero: {backgroundColor: '#DFF1EB', borderRadius: 24, gap: 9, padding: 22},
  eyebrow: {color: '#397663', fontSize: 14, fontWeight: '800'},
  title: {color: '#1C2925', fontSize: 30, fontWeight: '900', lineHeight: 39},
  description: {color: '#536962', fontSize: 15, lineHeight: 22},
  segment: {
    backgroundColor: '#E6ECE9',
    borderRadius: 14,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    paddingVertical: 11,
  },
  segmentSelected: {backgroundColor: '#FFFFFF'},
  segmentText: {color: '#667872', fontSize: 14, fontWeight: '700'},
  segmentSelectedText: {color: '#27614F', fontSize: 14, fontWeight: '800'},
  card: {backgroundColor: '#FFFFFF', borderRadius: 20, gap: 12, padding: 18},
  fieldLabel: {color: '#31453E', fontSize: 14, fontWeight: '700'},
  input: {
    backgroundColor: '#FAFCFB',
    borderColor: '#D5DFDB',
    borderRadius: 13,
    borderWidth: 1,
    color: '#1C2925',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  disclaimer: {color: '#76867F', fontSize: 12, lineHeight: 18, textAlign: 'center'},
  errorText: {color: '#B43F3F', fontSize: 14, lineHeight: 20},
  bootstrapError: {flex: 1, gap: 16, justifyContent: 'center', padding: 24},
});
