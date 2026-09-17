// apps/mobile/src/design-system/feedback/SlidingTabPill.tsx

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  badgeCount?: number;
}

export interface SlidingTabPillProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
}

export function SlidingTabPill<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  style,
  scrollable = false,
}: SlidingTabPillProps<T>) {
  const { theme } = useTheme();

  const handlePress = (tabKey: T) => {
    if (tabKey !== activeTab) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onTabChange(tabKey);
    }
  };

  const renderContent = () => (
    <View
      style={[
        styles.tabBarTrack,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.glassBorder,
        },
        style,
      ]}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => handlePress(tab.key)}
            style={[
              styles.tabBtn,
              isActive && [
                styles.tabBtnActive,
                {
                  backgroundColor: theme.colors.primary,
                },
              ],
            ]}
          >
            {tab.icon && (
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? '#FFFFFF' : theme.colors.textSecondary}
                style={styles.tabIcon}
              />
            )}
            <Text
              style={[
                styles.tabText,
                {
                  color: isActive ? '#FFFFFF' : theme.colors.textSecondary,
                  fontWeight: isActive ? '700' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            {typeof tab.badgeCount === 'number' && tab.badgeCount > 0 && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isActive ? '#FFFFFF' : theme.colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: isActive ? theme.colors.primary : '#FFFFFF',
                    },
                  ]}
                >
                  {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollTrack}
      >
        {renderContent()}
      </ScrollView>
    );
  }

  return renderContent();
}

const styles = StyleSheet.create({
  scrollTrack: {
    paddingVertical: 4,
  },
  tabBarTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    minHeight: 34,
  },
  tabBtnActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  tabIcon: {
    marginRight: 6,
  },
  tabText: {
    fontSize: 12,
    letterSpacing: -0.1,
  },
  badge: {
    marginLeft: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
});
