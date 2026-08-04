import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const Route = createRoute('/', { component: BabyNestHome });

const CARE_ITEMS = [
  { label: '수유', description: '먹인 시간과 양' },
  { label: '기저귀', description: '소변과 대변 기록' },
  { label: '수면', description: '잠든 시간과 기상' },
] as const;

export function BabyNestHome() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>함께봄</Text>
          <Text style={styles.title}>아기의 하루를{`\n`}양육자가 함께 봐요</Text>
          <Text style={styles.description}>
            수유, 기저귀, 수면 기록을 한곳에서 이어 가는 AppsInToss 후보 화면입니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>함께 기록할 돌봄</Text>
          {CARE_ITEMS.map(item => (
            <View key={item.label} style={styles.card}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.label.slice(0, 1)}</Text>
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{item.label}</Text>
                <Text style={styles.cardDescription}>{item.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>현재는 build-only 후보입니다</Text>
          <Text style={styles.noticeText}>
            로그인과 공동 기록 연결은 AppsInToss sandbox에서 보안·실기기 검증을 마친 뒤 활성화합니다.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8F6' },
  content: { padding: 20, paddingBottom: 36, gap: 22 },
  hero: { gap: 9, borderRadius: 24, backgroundColor: '#DFF1EB', padding: 22 },
  eyebrow: { color: '#397663', fontSize: 14, fontWeight: '800' },
  title: { color: '#1C2925', fontSize: 30, fontWeight: '900', lineHeight: 39 },
  description: { color: '#536962', fontSize: 15, lineHeight: 22 },
  section: { gap: 12 },
  sectionTitle: { color: '#1C2925', fontSize: 19, fontWeight: '800' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#DBE7E2',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  badge: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#5FB49C',
  },
  badgeText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  cardCopy: { flex: 1, gap: 3 },
  cardTitle: { color: '#1C2925', fontSize: 16, fontWeight: '800' },
  cardDescription: { color: '#6A7D77', fontSize: 14 },
  notice: { gap: 6, borderRadius: 18, backgroundColor: '#EDF4F1', padding: 16 },
  noticeTitle: { color: '#397663', fontSize: 15, fontWeight: '800' },
  noticeText: { color: '#536962', fontSize: 13, lineHeight: 20 },
});
