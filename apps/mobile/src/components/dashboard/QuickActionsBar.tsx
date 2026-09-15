import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';

export interface QuickActionItem {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
  badgeCount?: number;
  onPress: () => void;
}

export interface QuickActionsBarProps {
  pendingApprovalsCount?: number;
  onBarcodeScan?: () => void;
  onCreateOrder?: () => void;
  onAddPayment?: () => void;
  onPendingApprovals?: () => void;
  onStockCount?: () => void;
}

export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  pendingApprovalsCount = 0,
  onBarcodeScan,
  onCreateOrder,
  onAddPayment,
  onPendingApprovals,
  onStockCount,
}) => {
  const { theme } = useTheme();

  const actions: QuickActionItem[] = [
    {
      id: 'scan',
      title: 'Barkod Tara',
      icon: 'scan-outline',
      color: '#2563eb',
      bgColor: '#eff6ff',
      onPress: () => onBarcodeScan?.(),
    },
    {
      id: 'order',
      title: 'Sipariş Gir',
      icon: 'cart-outline',
      color: '#10b981',
      bgColor: '#ecfdf5',
      onPress: () => onCreateOrder?.(),
    },
    {
      id: 'payment',
      title: 'Tahsilat Al',
      icon: 'card-outline',
      color: '#8b5cf6',
      bgColor: '#f5f3ff',
      onPress: () => onAddPayment?.(),
    },
    {
      id: 'approvals',
      title: 'Onay Bekleyen',
      icon: 'checkmark-circle-outline',
      color: '#f59e0b',
      bgColor: '#fffbeb',
      badgeCount: pendingApprovalsCount,
      onPress: () => onPendingApprovals?.(),
    },
    {
      id: 'stock',
      title: 'Stok Sayımı',
      icon: 'cube-outline',
      color: '#0ea5e9',
      bgColor: '#f0f9ff',
      onPress: () => onStockCount?.(),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Hızlı İşlemler
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            activeOpacity={0.7}
            style={[
              styles.actionButton,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              action.onPress();
            }}
          >
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: action.bgColor,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <Ionicons name={action.icon} size={22} color={action.color} />
              {typeof action.badgeCount === 'number' && action.badgeCount > 0 && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.danger },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {action.badgeCount > 99 ? '99+' : action.badgeCount}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.actionTitle,
                { color: theme.colors.text },
              ]}
              numberOfLines={1}
            >
              {action.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 2,
    gap: 10,
  },
  actionButton: {
    width: 96,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  actionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
