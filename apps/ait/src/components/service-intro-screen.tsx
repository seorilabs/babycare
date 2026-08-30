import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {aitBottomInset, aitTopInset} from '../parity/system-insets';
import type {Strings} from '@babycare/product-ui';
import type {AppTheme} from '@babycare/product-ui';

const introCopy = {
  ko: {
    eyebrow: '함께봄 아기돌봄 기록',
    title: '함께 돌보는 하루를\n한눈에 기록해요',
    description:
      '수유부터 수면까지 필요한 돌봄을 빠르게 남기고, 초대한 양육자와 함께 확인하세요.',
    quickTitle: '빠르게 기록',
    quickDescription: '수유·기저귀·수면·체온·복약을 바로 남겨요.',
    shareTitle: '함께 확인',
    shareDescription: '초대 코드로 연결된 양육자끼리 기록을 공유해요.',
    summaryTitle: '한눈에 보기',
    summaryDescription: '최근 기록과 오늘의 돌봄 통계를 한곳에서 확인해요.',
    privateNotice: '돌봄 기록은 초대한 그룹 안에서만 공유돼요.',
    startAction: '토스로 시작하기',
    loginNotice: '버튼을 누르면 안전한 토스 로그인이 진행됩니다.',
  },
  en: {
    eyebrow: 'BABYNEST SHARED CARE LOG',
    title: 'Keep every caregiver\non the same page',
    description:
      'Log everyday care in seconds and review it together with the caregivers you invite.',
    quickTitle: 'Log in seconds',
    quickDescription: 'Track feeding, diapers, sleep, temperature, and medication.',
    shareTitle: 'Share care',
    shareDescription: 'Keep invited caregivers updated with one shared log.',
    summaryTitle: 'See the day',
    summaryDescription: 'Review recent care and today’s summary in one place.',
    privateNotice: 'Care entries are shared only inside your invited group.',
    startAction: 'Continue with Toss',
    loginNotice: 'Toss login starts only after you tap this button.',
  },
} as const;

export function ServiceIntroScreen(props: {
  readonly onStart: () => void;
  readonly strings: Strings;
  readonly theme: AppTheme;
}) {
  const insets = useSafeAreaInsets();
  const topInset = aitTopInset(insets.top, Platform.OS);
  const bottomInset = aitBottomInset(insets.bottom, Platform.OS);
  const copy =
    props.strings.intlLocale === 'ko-KR' ? introCopy.ko : introCopy.en;
  const benefits = [
    {
      icon: '⚡️',
      title: copy.quickTitle,
      description: copy.quickDescription,
    },
    {
      icon: '🤝',
      title: copy.shareTitle,
      description: copy.shareDescription,
    },
    {
      icon: '📊',
      title: copy.summaryTitle,
      description: copy.summaryDescription,
    },
  ];

  return (
    <View
      testID="service-intro"
      style={[
        styles.container,
        {
          backgroundColor: props.theme.colors.background,
          paddingBottom: bottomInset + 16,
          paddingTop: topInset + 20,
        },
      ]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.mark,
            {backgroundColor: props.theme.colors.primarySoft},
          ]}>
          <Text style={styles.markEmoji}>🌿</Text>
        </View>
        <Text style={[styles.eyebrow, {color: props.theme.colors.primary}]}>
          {copy.eyebrow}
        </Text>
        <Text style={[styles.title, {color: props.theme.colors.text}]}>
          {copy.title}
        </Text>
        <Text style={[styles.description, {color: props.theme.colors.textMuted}]}>
          {copy.description}
        </Text>
        <View style={styles.benefits}>
          {benefits.map(benefit => (
            <View
              key={benefit.title}
              style={[
                styles.benefit,
                {
                  backgroundColor: props.theme.colors.surface,
                  borderColor: props.theme.colors.border,
                },
              ]}>
              <Text style={styles.benefitIcon}>{benefit.icon}</Text>
              <View style={styles.benefitCopy}>
                <Text style={[styles.benefitTitle, {color: props.theme.colors.text}]}>
                  {benefit.title}
                </Text>
                <Text
                  style={[
                    styles.benefitDescription,
                    {color: props.theme.colors.textMuted},
                  ]}>
                  {benefit.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={[styles.privateNotice, {color: props.theme.colors.textMuted}]}>
          🔒 {copy.privateNotice}
        </Text>
      </ScrollView>
      <Pressable
        accessibilityLabel={copy.startAction}
        accessibilityRole="button"
        onPress={props.onStart}
        testID="service-intro-start"
        style={({pressed}) => [
          styles.startButton,
          {
            backgroundColor: props.theme.colors.primary,
            opacity: pressed ? 0.82 : 1,
          },
        ]}>
        <Text style={styles.startButtonText}>
          {copy.startAction}
        </Text>
      </Pressable>
      <Text style={[styles.loginNotice, {color: props.theme.colors.textMuted}]}>
        {copy.loginNotice}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, paddingHorizontal: 24},
  content: {flexGrow: 1, paddingBottom: 24},
  mark: {
    alignItems: 'center',
    borderRadius: 24,
    height: 68,
    justifyContent: 'center',
    marginBottom: 24,
    width: 68,
  },
  markEmoji: {fontSize: 34},
  eyebrow: {fontSize: 12, fontWeight: '900', letterSpacing: 1.6},
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.3,
    lineHeight: 43,
    marginTop: 10,
  },
  description: {fontSize: 16, lineHeight: 25, marginTop: 14},
  benefits: {gap: 10, marginTop: 28},
  benefit: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  benefitIcon: {fontSize: 26, marginRight: 14},
  benefitCopy: {flex: 1},
  benefitTitle: {fontSize: 15, fontWeight: '900'},
  benefitDescription: {fontSize: 12, lineHeight: 18, marginTop: 3},
  privateNotice: {fontSize: 12, lineHeight: 19, marginTop: 18},
  startButton: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
  },
  startButtonText: {color: '#FFFFFF', fontSize: 17, fontWeight: '900'},
  loginNotice: {fontSize: 11, lineHeight: 17, marginTop: 10, textAlign: 'center'},
});
