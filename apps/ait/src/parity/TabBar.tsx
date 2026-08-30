import React from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {Strings} from '@babycare/product-ui';
import {aitBottomInset} from './system-insets';
import type {AppTheme} from '@babycare/product-ui';

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
      testID="floating-tab-bar-shell"
      style={[
        styles.shell,
        {
          paddingBottom: bottomInset + 10,
        },
      ]}>
      <View
        accessibilityRole="tablist"
        testID="floating-tab-bar-surface"
        style={[
          styles.container,
          {
            backgroundColor: props.theme.colors.surface,
            borderColor: props.theme.colors.border,
            shadowColor: props.theme.dark ? '#000000' : '#18201E',
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
              style={styles.tab}
              testID={`floating-tab-${tab.id}`}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  container: {
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 4,
    paddingVertical: 7,
    shadowOffset: {height: 6, width: 0},
    shadowOpacity: 0.14,
    shadowRadius: 12,
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
