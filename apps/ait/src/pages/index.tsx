import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const Route = createRoute('/', { component: BabyNestHome });

export function BabyNestHome() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>함께봄</Text>
          <Text style={styles.title}>성인 양육자를 위한{`\n`}함께봄</Text>
          <Text style={styles.description}>
            의료 판단이나 진단을 제공하지 않습니다.
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
});
