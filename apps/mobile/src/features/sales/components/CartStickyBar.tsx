// apps/mobile/src/features/sales/components/CartStickyBar.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { CustomerRef } from '../../../store/redux/cartOrderSlice';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { formatCurrency } from '../../../lib/utils';

export interface CartStickyBarProps {
  customer: CustomerRef | null;
  totalItems: number;
  totalQuantity: number;
  grandTotal: number;
  onPressCart: () => void;
  onPressCustomer?: () => void;
}

export const CartStickyBar: React.FC<CartStickyBarProps> = ({
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
    <View style={styles.outerWrapper}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.surface0,
            borderColor: theme.colors.glassBorder,
            shadowColor: '#000000',
          },
        ]}
      >
        {/* Left Side: Customer & Totals */}
        <View style={styles.leftCol}>
          <TouchableOpacity
            style={[
              styles.customerPill,
              {
                backgroundColor: customer
                  ? 'rgba(59, 130, 246, 0.12)'
                  : 'rgba(245, 158, 11, 0.12)',
                borderColor: customer
                  ? 'rgba(59, 130, 246, 0.3)'
                  : 'rgba(245, 158, 11, 0.3)',
              },
            ]}
            onPress={handleCustomerPress}
            activeOpacity={0.7}
          >
            <Ionicons
              name="person-outline"
              size={11}
              color={customer ? theme.colors.primary : theme.colors.warning}
            />
            <Text
              style={[
                styles.customerPillText,
                { color: customer ? theme.colors.primary : theme.colors.warning },
              ]}
              numberOfLines={1}
            >
              {customer ? customer.name : 'Müşteri Seç'}
            </Text>
          </TouchableOpacity>

          <View style={styles.totalsRow}>
            <TabularText style={[styles.grandTotal, { color: theme.colors.textPrimary }]}>
              {formatCurrency(grandTotal)}
            </TabularText>
            <View
              style={[
                styles.itemBadge,
                { backgroundColor: theme.colors.surface2 },
              ]}
            >
              <Text style={[styles.itemBadgeText, { color: theme.colors.textSecondary }]}>
                {totalItems} Kalem ({totalQuantity} Adet)
              </Text>
            </View>
          </View>
        </View>

        {/* Right Side: CTA Button */}
        <SpringPressable
          onPress={handleCartPress}
          style={[
            styles.checkoutBtn,
            {
              backgroundColor: theme.colors.primary,
              shadowColor: theme.colors.primary,
            },
          ]}
        >
          <Ionicons name="cart-outline" size={18} color="#FFFFFF" />
          <Text style={styles.checkoutBtnText}>Siparişi Tamamla</Text>
          <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
        </SpringPressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 100,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    gap: 12,
  },
  leftCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  customerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 180,
  },
  customerPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grandTotal: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  itemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  itemBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  checkoutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
