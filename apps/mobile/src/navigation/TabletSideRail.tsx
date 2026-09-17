// apps/mobile/src/navigation/TabletSideRail.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../design-system/hooks/useTheme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { MainTabParamList } from '../types/navigation.types';
import { useAuthStore } from '../store/auth.store';
import { useNotificationStore } from '../store/notification.store';
import { useApprovalStore } from '../store/approval.store';

export interface TabletSideRailProps {
  activeRouteName: keyof MainTabParamList;
  onNavigate: (routeName: keyof MainTabParamList) => void;
}

interface RailItem {
  name: keyof MainTabParamList;
  label: string;
  iconFocused: keyof typeof Ionicons.glyphMap;
  iconOutline: keyof typeof Ionicons.glyphMap;
  badge?: number;
}

export const TabletSideRail: React.FC<TabletSideRailProps> = ({
  activeRouteName,
  onNavigate,
}) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { isLandscape, insets } = useResponsive();
  const { tenant } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const { requests } = useApprovalStore();

  const pendingApprovalsCount = requests.filter((r) => r.status === 'PENDING').length;

  const isExpanded = isLandscape;
  const railWidth = isExpanded ? 220 : 72;

  const railItems: RailItem[] = [
    {
      name: 'DashboardTab',
      label: 'Özet Pano',
      iconFocused: 'grid',
      iconOutline: 'grid-outline',
    },
    {
      name: 'ApprovalsTab',
      label: 'Onaylar',
      iconFocused: 'checkmark-done-circle',
      iconOutline: 'checkmark-done-circle-outline',
      badge: pendingApprovalsCount,
    },
    {
      name: 'InventoryTab',
      label: 'Depo & WMS',
      iconFocused: 'barcode',
      iconOutline: 'barcode-outline',
    },
    {
      name: 'SalesTab',
      label: 'Saha Satış',
      iconFocused: 'cart',
      iconOutline: 'cart-outline',
    },
    {
      name: 'ProfileTab',
      label: 'Profil & Ayarlar',
      iconFocused: 'person',
      iconOutline: 'person-outline',
      badge: unreadCount,
    },
  ];

  const handleItemPress = (name: keyof MainTabParamList) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onNavigate(name);
  };

  return (
    <View
      style={[
        styles.railContainer,
        {
          width: railWidth,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
          backgroundColor: theme.colors.surface0,
          borderRightColor: theme.colors.glassBorder,
        },
      ]}
    >
      {/* Brand Header */}
      <View style={[styles.brandHeader, isExpanded && styles.brandHeaderExpanded]}>
        <View style={[styles.brandLogoBox, { backgroundColor: theme.colors.primary }]}>
          <Ionicons name="cube" size={20} color="#FFFFFF" />
        </View>
        {isExpanded && (
          <View style={styles.brandTextContainer}>
            <Text style={[styles.brandTitle, { color: theme.colors.textPrimary }]}>AXON ERP</Text>
            <Text style={[styles.tenantName, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {tenant?.companyName || 'Kurumsal'}
            </Text>
          </View>
        )}
      </View>

      {/* Navigation Rail Items */}
      <View style={styles.itemsList}>
        {railItems.map((item) => {
          const isActive = activeRouteName === item.name;

          return (
            <TouchableOpacity
              key={item.name}
              activeOpacity={0.7}
              onPress={() => handleItemPress(item.name)}
              style={[
                styles.railButton,
                isExpanded ? styles.railButtonExpanded : styles.railButtonCompact,
                isActive && [
                  styles.railButtonActive,
                  {
                    backgroundColor: theme.colors.surface2,
                    borderColor: theme.colors.glassBorderActive,
                  },
                ],
              ]}
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name={isActive ? item.iconFocused : item.iconOutline}
                  size={22}
                  color={isActive ? theme.colors.primary : theme.colors.textSecondary}
                />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <View
                    style={[
                      styles.badgeDot,
                      {
                        backgroundColor: theme.colors.crimsonLaser,
                      },
                    ]}
                  >
                    <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                  </View>
                )}
              </View>

              {isExpanded && (
                <Text
                  style={[
                    styles.itemLabel,
                    {
                      color: isActive ? theme.colors.textPrimary : theme.colors.textSecondary,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottom Footer Actions */}
      <View style={styles.footerActions}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            toggleTheme();
          }}
          style={[
            styles.footerBtn,
            isExpanded && styles.footerBtnExpanded,
            { backgroundColor: theme.colors.surface1, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <Ionicons
            name={isDark ? 'sunny-outline' : 'moon-outline'}
            size={18}
            color={theme.colors.textSecondary}
          />
          {isExpanded && (
            <Text style={[styles.footerBtnText, { color: theme.colors.textSecondary }]}>
              {isDark ? 'Açık Mod' : 'Koyu Mod'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  railContainer: {
    borderRightWidth: 1,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  brandHeader: {
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  brandHeaderExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandLogoBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tenantName: {
    fontSize: 11,
    fontWeight: '500',
  },
  itemsList: {
    flex: 1,
    paddingHorizontal: 8,
    gap: 6,
  },
  railButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
  },
  railButtonCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  railButtonExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  railButtonActive: {},
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -4,
    right: -8,
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
  itemLabel: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
  footerActions: {
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  footerBtn: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  footerBtnExpanded: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  footerBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
