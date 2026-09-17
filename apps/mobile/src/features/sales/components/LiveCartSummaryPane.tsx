// apps/mobile/src/features/sales/components/LiveCartSummaryPane.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { CustomerRef, CartOrderItem } from '../../../store/redux/cartOrderSlice';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { Badge } from '../../../components/common/Badge';
import { formatCurrency } from '../../../lib/utils';

export type PaymentMethod = 'CASH' | 'CARD' | 'OPEN_ACCOUNT';

export interface LiveCartSummaryPaneProps {
  customer: CustomerRef | null;
  items: CartOrderItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onSelectCustomer: () => void;
  onClearCart: () => void;
  onCheckout: (paymentMethod: PaymentMethod) => void;
}

export const LiveCartSummaryPane: React.FC<LiveCartSummaryPaneProps> = ({
  customer,
  items,
  subtotal,
  totalDiscount,
  totalTax,
  grandTotal,
  onUpdateQuantity,
  onRemoveItem,
  onSelectCustomer,
  onClearCart,
  onCheckout,
}) => {
  const { theme } = useTheme();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');

  // Customer Risk Calculation
  const creditLimit = customer?.creditLimit || 0;
  const currentBalance = customer?.currentBalance || 0;
  const riskRatio = creditLimit > 0 ? Math.min(100, Math.round((currentBalance / creditLimit) * 100)) : 0;
  const isHighRisk = riskRatio >= 80 || customer?.riskLevel === 'exceeded';
  const isModerateRisk = riskRatio >= 60 && riskRatio < 80;

  const getRiskColor = () => {
    if (isHighRisk) return theme.colors.crimsonLaser;
    if (isModerateRisk) return theme.colors.amberPulse;
    return theme.colors.emeraldNeon;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface0,
          borderColor: theme.colors.glassBorder,
        },
      ]}
    >
      {/* ── 1. Customer Selection & Risk Indicator Header ── */}
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onSelectCustomer();
        }}
        activeOpacity={0.8}
        style={[
          styles.customerCard,
          {
            backgroundColor: theme.colors.surface1,
            borderColor: isHighRisk
              ? theme.colors.crimsonLaser
              : theme.colors.glassBorder,
          },
        ]}
      >
        <View style={styles.customerHeaderRow}>
          <View style={styles.customerIconWrap}>
            <Ionicons
              name="business-outline"
              size={18}
              color={customer ? theme.colors.primary : theme.colors.textMuted}
            />
            <View>
              <Text style={[styles.customerLabel, { color: theme.colors.textMuted }]}>
                CARİ MÜŞTERİ
              </Text>
              <Text
                style={[
                  styles.customerName,
                  { color: customer ? theme.colors.textPrimary : theme.colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {customer ? customer.name : 'Müşteri Seçilmedi'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
        </View>

        {/* Customer Risk Meter Bar */}
        {customer && creditLimit > 0 && (
          <View style={styles.riskMeterWrap}>
            <View style={styles.riskLabelRow}>
              <Text style={[styles.riskLabel, { color: theme.colors.textSecondary }]}>
                Risk Limiti: {formatCurrency(creditLimit)}
              </Text>
              <Badge
                label={`%${riskRatio} ${isHighRisk ? 'Kritik Risk' : 'Kullanıldı'}`}
                variant={isHighRisk ? 'danger' : isModerateRisk ? 'warning' : 'success'}
                size="sm"
              />
            </View>
            <View
              style={[
                styles.progressBarTrack,
                { backgroundColor: theme.colors.surface2 },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(riskRatio, 100)}%`,
                    backgroundColor: getRiskColor(),
                  },
                ]}
              />
            </View>
            <Text style={[styles.balanceSubtext, { color: theme.colors.textMuted }]}>
              Açık Bakiye: {formatCurrency(currentBalance)}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── 2. Cart Items Stream ── */}
      <View style={styles.itemsHeader}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          Canlı Sepet ({items.length} Kalem)
        </Text>
        {items.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onClearCart();
            }}
          >
            <Text style={[styles.clearBtnText, { color: theme.colors.crimsonLaser }]}>
              Sepeti Temizle
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.itemsList}
        contentContainerStyle={styles.itemsListContent}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <View style={styles.emptyCart}>
            <Ionicons name="cart-outline" size={40} color={theme.colors.textMuted} />
            <Text style={[styles.emptyCartTitle, { color: theme.colors.textSecondary }]}>
              Sepette Ürün Yok
            </Text>
            <Text style={[styles.emptyCartDesc, { color: theme.colors.textMuted }]}>
              Sol katalogdan ürün ekleyebilir veya barkod ile okutabilirsiniz.
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const lineTotal = item.unitPrice * item.quantity * (1 - (item.discount || 0) / 100);
            return (
              <View
                key={item.productId}
                style={[
                  styles.cartItemCard,
                  {
                    backgroundColor: theme.colors.surface1,
                    borderColor: theme.colors.glassBorder,
                  },
                ]}
              >
                <View style={styles.itemTopRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text
                      style={[styles.itemName, { color: theme.colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={[styles.itemCode, { color: theme.colors.textMuted }]}>
                      {item.code} · {formatCurrency(item.unitPrice)}/{item.unit || 'AD'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onRemoveItem(item.productId)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.colors.crimsonLaser} />
                  </TouchableOpacity>
                </View>

                {/* Bottom Stepper & Line Total */}
                <View style={styles.itemBottomRow}>
                  <View
                    style={[
                      styles.itemStepper,
                      {
                        backgroundColor: theme.colors.surface0,
                        borderColor: theme.colors.glassBorder,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                      style={styles.stepperSubBtn}
                    >
                      <Ionicons name="remove" size={13} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <TabularText style={[styles.stepperVal, { color: theme.colors.textPrimary }]}>
                      {item.quantity}
                    </TabularText>
                    <TouchableOpacity
                      onPress={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                      style={styles.stepperSubBtn}
                    >
                      <Ionicons name="add" size={13} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <TabularText style={[styles.lineTotalText, { color: theme.colors.textPrimary }]}>
                    {formatCurrency(lineTotal)}
                  </TabularText>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── 3. Payment Method Selector ── */}
      <View style={styles.paymentSection}>
        <Text style={[styles.paymentTitle, { color: theme.colors.textSecondary }]}>
          TAHSİLAT TİPİ
        </Text>
        <View style={styles.paymentRow}>
          {[
            { key: 'CASH' as PaymentMethod, label: 'Nakit', icon: 'cash-outline' },
            { key: 'CARD' as PaymentMethod, label: 'Kredi Kartı', icon: 'card-outline' },
            { key: 'OPEN_ACCOUNT' as PaymentMethod, label: 'Açık Hesap', icon: 'document-text-outline' },
          ].map((m) => {
            const isSelected = paymentMethod === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setPaymentMethod(m.key);
                }}
                style={[
                  styles.paymentBtn,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.surface1,
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.glassBorder,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={m.icon as any}
                  size={14}
                  color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.paymentBtnText,
                    {
                      color: isSelected ? '#FFFFFF' : theme.colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── 4. Financial Breakdown & Checkout CTA ── */}
      <View
        style={[
          styles.summaryFooter,
          {
            backgroundColor: theme.colors.surface1,
            borderTopColor: theme.colors.glassBorder,
          },
        ]}
      >
        <View style={styles.totalsDetails}>
          <View style={styles.detailLine}>
            <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Ara Toplam:</Text>
            <TabularText style={[styles.detailVal, { color: theme.colors.textSecondary }]}>
              {formatCurrency(subtotal)}
            </TabularText>
          </View>
          {totalDiscount > 0 && (
            <View style={styles.detailLine}>
              <Text style={[styles.detailKey, { color: theme.colors.crimsonLaser }]}>İskonto:</Text>
              <TabularText style={[styles.detailVal, { color: theme.colors.crimsonLaser }]}>
                -{formatCurrency(totalDiscount)}
              </TabularText>
            </View>
          )}
          <View style={styles.detailLine}>
            <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>KDV Toplamı:</Text>
            <TabularText style={[styles.detailVal, { color: theme.colors.textSecondary }]}>
              {formatCurrency(totalTax)}
            </TabularText>
          </View>
          <View style={[styles.detailLine, styles.grandTotalLine]}>
            <Text style={[styles.grandLabel, { color: theme.colors.textPrimary }]}>Genel Toplam:</Text>
            <TabularText style={[styles.grandVal, { color: theme.colors.textPrimary }]}>
              {formatCurrency(grandTotal)}
            </TabularText>
          </View>
        </View>

        <SpringPressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onCheckout(paymentMethod);
          }}
          disabled={items.length === 0}
          style={[
            styles.checkoutBtn,
            {
              backgroundColor: items.length === 0 ? theme.colors.surface2 : theme.colors.primary,
              opacity: items.length === 0 ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.checkoutBtnText}>Siparişi Tamamla</Text>
        </SpringPressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  customerCard: {
    padding: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  customerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  customerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '800',
  },
  riskMeterWrap: {
    gap: 6,
    paddingTop: 4,
  },
  riskLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riskLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  balanceSubtext: {
    fontSize: 11,
    fontWeight: '500',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemsList: {
    flex: 1,
  },
  itemsListContent: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyCartTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCartDesc: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 200,
  },
  cartItemCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemCode: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 8,
  },
  stepperSubBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperVal: {
    fontSize: 12,
    fontWeight: '800',
    minWidth: 16,
    textAlign: 'center',
  },
  lineTotalText: {
    fontSize: 13,
    fontWeight: '800',
  },
  paymentSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    gap: 8,
  },
  paymentTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paymentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  paymentBtnText: {
    fontSize: 11,
  },
  summaryFooter: {
    padding: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  totalsDetails: {
    gap: 4,
  },
  detailLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailKey: {
    fontSize: 12,
  },
  detailVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  grandTotalLine: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  grandLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  grandVal: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  checkoutBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
