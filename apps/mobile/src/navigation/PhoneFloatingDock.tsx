// apps/mobile/src/navigation/PhoneFloatingDock.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../design-system/hooks/useTheme';
import { useApprovalStore } from '../store/approval.store';

export const PhoneFloatingDock: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { requests } = useApprovalStore();

  const pendingApprovalsCount = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <View
      style={[
        styles.dockWrapper,
        {
          bottom: insets.bottom > 0 ? insets.bottom + 4 : 12,
        },
      ]}
    >
      <View
        style={[
          styles.dockContainer,
          {
            backgroundColor: theme.colors.surface0,
            borderColor: theme.colors.glassBorder,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              navigation.navigate(route.name);
            }
          };

          const getTabIcon = (focused: boolean): keyof typeof Ionicons.glyphMap => {
            switch (route.name) {
              case 'DashboardTab':
                return focused ? 'grid' : 'grid-outline';
              case 'ApprovalsTab':
                return focused ? 'checkmark-done-circle' : 'checkmark-done-circle-outline';
              case 'InventoryTab':
                return focused ? 'barcode' : 'barcode-outline';
              case 'SalesTab':
                return focused ? 'cart' : 'cart-outline';
              case 'ProfileTab':
                return focused ? 'person' : 'person-outline';
              default:
                return 'ellipse-outline';
            }
          };

          const label =
            options.tabBarLabel !== undefined
              ? (options.tabBarLabel as string)
              : options.title !== undefined
              ? options.title
              : route.name;

          const showBadge = route.name === 'ApprovalsTab' && pendingApprovalsCount > 0;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              activeOpacity={0.7}
              style={[
                styles.tabItem,
                isFocused && [
                  styles.tabItemFocused,
                  {
                    backgroundColor: theme.colors.surface2,
                  },
                ],
              ]}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name={getTabIcon(isFocused)}
                  size={21}
                  color={isFocused ? theme.colors.primary : theme.colors.tabBarInactive}
                />
                {showBadge && (
                  <View style={[styles.badge, { backgroundColor: theme.colors.crimsonLaser }]}>
                    <Text style={styles.badgeText}>
                      {pendingApprovalsCount > 99 ? '99+' : pendingApprovalsCount}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused ? theme.colors.primary : theme.colors.tabBarInactive,
                    fontWeight: isFocused ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dockWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  dockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 460,
    height: 60,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 14,
    gap: 2,
  },
  tabItemFocused: {},
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: -0.2,
  },
});
