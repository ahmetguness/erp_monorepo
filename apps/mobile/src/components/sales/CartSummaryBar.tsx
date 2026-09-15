import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { CustomerRef } from '../../store/redux/cartOrderSlice';
import { formatCurrency } from '../../lib/utils';

export interface CartSummaryBarProps {
  customer: CustomerRef | null;
  totalItems: number;
  totalQuantity: number;
  grandTotal: number;
  onPressCart: () => void;
  onPressCustomer?: () => void;
}

export const CartSummaryBar: React.FC<CartSummaryBarProps> = ({
  customer,
  totalItems,
  totalQuantity,
  grandTotal,
  onPressCart,
  onPressCustomer,
}) => {
  const { theme } = useTheme();

  if (totalItems === 0) return null;

  const handleCartPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPressCart();
  };

  const handleCustomerPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPressCustomer?.();
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderTopColor: theme.colors.borderSubtle,
          ...theme.shadows.lg,
        },
      ]}
    >
      <View style={styles.leftCol}>
        {/* Customer indicator pill */}
        <TouchableOpacity
          style={[
            styles.customerPill,
            {
              backgroundColor: customer
                ? theme.colors.primaryMuted
                : theme.colors.warningMuted,
            },
          ]}
          onPress={handleCustomerPress}
          activeOpacity={0.7}
        >
          <Ionicons
            name="person-outline"
            size={12}
            color={customer ? theme.colors.primary : theme.colors.warning}
          />
          <Text
            style={[
              styles.customerPillText,
              { color: customer ? theme.colors.primary : theme.colors.warning },
            ]}
            numberOfLines={1}
          >
            {customer ? customer.name : 'Müşteri Seçilmedi'}
          </Text>
        </TouchableOpacity>

        {/* Totals info */}
        <View style={styles.totalsRow}>
          <Text style={[styles.grandTotal, { color: theme.colors.text }]}>
            {formatCurrency(grandTotal)}
          </Text>
          <Text style={[styles.itemCountText, { color: theme.colors.textMuted }]}>
            ({totalItems} Kalem, {totalQuantity} Adet)
          </Text>
        </View>
      </View>

      {/* Cart button */}
      <TouchableOpacity
        style={[styles.cartBtn, { backgroundColor: theme.colors.primary }]}
        onPress={handleCartPress}
        activeOpacity={0.8}
      >
        <Ionicons name="cart" size={18} color="#ffffff" />
        <Text style={styles.cartBtnText}>Sepeti İncele</Text>
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{totalItems}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    zIndex: 10,
  },
  leftCol: {
    flex: 1,
    marginRight: 12,
    gap: 3,
  },
  customerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    maxWidth: 180,
  },
  customerPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  grandTotal: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  itemCountText: {
    fontSize: 11,
    fontWeight: '500',
  },
  cartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  cartBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  cartBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cartBadgeText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
  },
});
