import React from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {Strings} from './strings';
import type {AppTheme} from './theme';

export type AppTab = 'home' | 'timeline' | 'stats' | 'more';

const tabs: ReadonlyArray<{
  readonly id: AppTab;
  readonly icon: string;
  readonly label: (strings: Strings) => string;
}> = [
  {id: 'home', icon: '⌂', label: strings => strings.tabs.home},
  {id: 'timeline', icon: '≡', label: strings => strings.tabs.timeline},
  {id: 'stats', icon: '▦', label: strings => strings.tabs.stats},
  {id: 'more', icon: '•••', label: strings => strings.tabs.more},
];

// AppsInToss Android hosts can report a zero bottom inset while drawing the
// system navigation surface over the mini-app. Keep the native inset when it
// exists and reserve the Android gesture area only for that zero-inset case.
export function aitBottomInset(bottomInset: number, platform: string): number {
  return bottomInset > 0 ? bottomInset : platform === 'android' ? 24 : 0;
}

export function TabBar(props: {
  readonly active: AppTab;
  readonly onChange: (tab: AppTab) => void;
  readonly strings: Strings;
  readonly theme: AppTheme;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = aitBottomInset(insets.bottom, Platform.OS);

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.container,
        {
          backgroundColor: props.theme.colors.surface,
          borderTopColor: props.theme.colors.border,
          paddingBottom: Math.max(6, bottomInset),
        },
      ]}>
      {tabs.map(tab => {
        const selected = tab.id === props.active;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected}}
            key={tab.id}
            onPress={() => props.onChange(tab.id)}
            style={styles.tab}>
            <Text
              style={[
                styles.icon,
                {color: selected ? props.theme.colors.primary : props.theme.colors.textMuted},
              ]}>
              {tab.icon}
            </Text>
            <Text
              style={[
                styles.label,
                {
                  color: selected ? props.theme.colors.primary : props.theme.colors.textMuted,
                },
                selected ? styles.selectedLabel : styles.unselectedLabel,
              ]}>
              {tab.label(props.strings)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 66,
    paddingBottom: 6,
    paddingTop: 7,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  icon: {
    fontSize: 23,
    lineHeight: 24,
  },
  label: {
    fontSize: 11,
    marginTop: 3,
  },
  selectedLabel: {fontWeight: '700'},
  unselectedLabel: {fontWeight: '500'},
});
