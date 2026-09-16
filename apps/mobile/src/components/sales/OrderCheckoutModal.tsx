import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/redux';
import {
  selectCartOrder,
  selectCartContact,
  selectCartItemsList,
  selectCartTotals,
  selectIsRiskLimitExceeded,
  setGeneralDiscountPercent,
  setOrderMetadata,
  updateItemDiscount,
  updateItemQuantity,
  removeItemFromCart,
  clearCartItems,
  setLastCreatedOrderNumber,
  CartOrderItem,
} from '../../store/redux/cartOrderSlice';
import { queueMutation, selectIsOnline } from '../../store/redux';
import { createSalesOrder, SalesOrder } from '../../services/sales.service';
import { Badge } from '../common/Badge';
import { formatCurrency } from '../../lib/utils';

export interface OrderCheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  onOrderSuccess: (order: SalesOrder) => void;
  onSelectCustomerPress: () => void;
}

const PAYMENT_TERM_OPTIONS = [
  { label: 'Peşin', days: 0 },
  { label: '15 Gün', days: 15 },
  { label: '30 Gün', days: 30 },
  { label: '45 Gün', days: 45 },
  { label: '60 Gün', days: 60 },
];

export const OrderCheckoutModal: React.FC<OrderCheckoutModalProps> = ({
  visible,
  onClose,
  onOrderSuccess,
  onSelectCustomerPress,
}) => {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();

  const cart = useAppSelector(selectCartOrder);
  const customer = useAppSelector(selectCartContact);
  const items = useAppSelector(selectCartItemsList);
  const totals = useAppSelector(selectCartTotals);
  const isRiskExceeded = useAppSelector(selectIsRiskLimitExceeded);
  const isOnline = useAppSelector(selectIsOnline);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTermDays, setSelectedTermDays] = useState<number>(0);
  const [notes, setNotes] = useState(cart.notes);
  const [deliveryAddress, setDeliveryAddress] = useState(cart.deliveryAddress || customer?.address || '');
  const [generalDiscountText, setGeneralDiscountText] = useState(
    cart.generalDiscountPercent > 0 ? String(cart.generalDiscountPercent) : ''
  );

  const handleSelectTerm = (days: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedTermDays(days);
    if (days === 0) {
      dispatch(setOrderMetadata({ dueDate: null }));
    } else {
      const d = new Date();
      d.setDate(d.getDate() + days);
      dispatch(setOrderMetadata({ dueDate: d.toISOString() }));
    }
  };

  const handleGeneralDiscountChange = (text: string) => {
    setGeneralDiscountText(text);
    const num = parseFloat(text);
    if (!isNaN(num)) {
      dispatch(setGeneralDiscountPercent(num));
    } else {
      dispatch(setGeneralDiscountPercent(0));
    }
  };

  const handleItemDiscountChange = (productId: string, discountStr: string) => {
    const num = parseFloat(discountStr);
    dispatch(updateItemDiscount({ productId, discount: isNaN(num) ? 0 : num }));
  };

  const handleSubmitOrder = async () => {
    if (!customer) {
      Alert.alert('Eksik Bilgi', 'Lütfen sipariş oluşturmadan önce müşteri seçin.');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Sepet Boş', 'Lütfen sepete en az bir ürün ekleyin.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Risk limit warning confirmation
    if (isRiskExceeded) {
      Alert.alert(
        'Risk Limiti Uyarısı',
        `Müşterinin mevcut bakiyesi (${formatCurrency(customer.currentBalance ?? 0)}) ve bu sipariş toplamı (${formatCurrency(totals.grandTotal)}) tanımlı risk limitini (${formatCurrency(customer.creditLimit ?? 0)}) aşmaktadır.\n\nYine de siparişi onaylamak istiyor musunuz?`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Siparişi Onayla', style: 'destructive', onPress: () => processOrderSubmission() },
        ]
      );
      return;
    }

    processOrderSubmission();
  };

  const processOrderSubmission = async () => {
    if (!customer) return;

    setIsSubmitting(true);
    try {
      // Calculate due date if days selected
      let dueDateIso: string | undefined = undefined;
      if (selectedTermDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + selectedTermDays);
        dueDateIso = d.toISOString();
      }

      const orderPayload = {
        contactId: customer.id,
        date: new Date().toISOString(),
        dueDate: dueDateIso,
        notes: notes.trim() ? notes.trim() : undefined,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          taxRate: i.taxRate,
        })),
      };

      // 10.2: Offline Outbox check
      if (!isOnline) {
        dispatch(
          queueMutation({
            type: 'CREATE_SALES_ORDER',
            payload: orderPayload,
            title: `Satış Siparişi - ${customer.name} (${items.length} Kalem)`,
          })
        );
        dispatch(clearCartItems());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Çevrimdışı Sipariş Alındı',
          'İnternet bağlantınız bulunmadığı için sipariş yerel kuyruğa kaydedildi. Bağlantı kurulduğunda otomatik olarak sunucuya aktarılacaktır.'
        );
        onClose();
        return;
      }

      const created = await createSalesOrder(orderPayload);
      if (created?.id) {
        dispatch(setLastCreatedOrderNumber(created.number));
        dispatch(clearCartItems());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
        onOrderSuccess(created);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

      if (!axiosErr?.response) {
        Alert.alert(
          'Ağ Hatası',
          'Sunucuya ulaşılamadı. Siparişi çevrimdışı kuyruğa kaydedip internet geldiğinde otomatik göndermek ister misiniz?',
          [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Kuyruğa Ekle',
              onPress: () => {
                dispatch(
                  queueMutation({
                    type: 'CREATE_SALES_ORDER',
                    payload: {
                      contactId: customer.id,
                      date: new Date().toISOString(),
                      notes: notes.trim() ? notes.trim() : undefined,
                      items: items.map((i) => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        discount: i.discount,
                        taxRate: i.taxRate,
                      })),
                    },
                    title: `Satış Siparişi - ${customer.name} (${items.length} Kalem)`,
                  })
                );
                dispatch(clearCartItems());
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                onClose();
              },
            },
          ]
        );
        return;
      }

      Alert.alert('Hata', axiosErr?.response?.data?.message || 'Sipariş kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'bottom']}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderBottomColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: theme.colors.primaryMuted },
              ]}
            >
              <Ionicons name="cart-outline" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Siparişi Tamamla
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {items.length} Kalem • {totals.totalQuantity} Adet
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Customer Selection Banner */}
          <TouchableOpacity
            style={[
              styles.customerCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: customer ? theme.colors.borderSubtle : theme.colors.warning,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
            onPress={onSelectCustomerPress}
            activeOpacity={0.7}
          >
            <View style={styles.customerCardLeft}>
              <View
                style={[
                  styles.customerIcon,
                  {
                    backgroundColor: customer
                      ? theme.colors.primaryMuted
                      : theme.colors.warningMuted,
                  },
                ]}
              >
                <Ionicons
                  name="person"
                  size={18}
                  color={customer ? theme.colors.primary : theme.colors.warning}
                />
              </View>
              <View style={styles.customerInfo}>
                <Text style={[styles.customerLabel, { color: theme.colors.textMuted }]}>
                  SİPARİŞ MÜŞTERİSİ
                </Text>
                <Text style={[styles.customerName, { color: theme.colors.text }]} numberOfLines={1}>
                  {customer ? customer.name : 'Müşteri Seçin (Zorunlu)'}
                </Text>
                {customer && (
                  <Text style={[styles.customerMeta, { color: theme.colors.textSecondary }]}>
                    Bakiye: {formatCurrency(customer.currentBalance ?? 0)}
                    {customer.creditLimit ? ` • Limit: ${formatCurrency(customer.creditLimit)}` : ''}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.changeCustBtn}>
              <Text style={[styles.changeCustText, { color: theme.colors.primary }]}>
                {customer ? 'Değiştir' : 'Seç'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
            </View>
          </TouchableOpacity>

          {/* Risk Limit Warning Banner */}
          {isRiskExceeded && customer && (
            <View style={styles.riskExceededBanner}>
              <Ionicons name="alert-circle" size={20} color="#ffffff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.riskExceededTitle}>Risk Limiti Aşıldı!</Text>
                <Text style={styles.riskExceededDesc}>
                  Sipariş sonrasında cari bakiye{' '}
                  {formatCurrency((customer.currentBalance ?? 0) + totals.grandTotal)} seviyesine ulaşarak{' '}
                  {formatCurrency(customer.creditLimit ?? 0)} limitini aşacaktır.
                </Text>
              </View>
            </View>
          )}

          {/* Payment Terms Chips */}
          <View
            style={[
              styles.sectionBox,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Ödeme Vadesi</Text>
            <View style={styles.termsRow}>
              {PAYMENT_TERM_OPTIONS.map((opt) => {
                const isSelected = selectedTermDays === opt.days;
                return (
                  <TouchableOpacity
                    key={opt.days}
                    style={[
                      styles.termChip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.borderSubtle,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                    onPress={() => handleSelectTerm(opt.days)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.termChipText,
                        { color: isSelected ? '#ffffff' : theme.colors.textSecondary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Order Lines Summary List */}
          <View
            style={[
              styles.sectionBox,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Sipariş Kalemleri ({items.length})
            </Text>

            {items.map((item) => (
              <View
                key={item.productId}
                style={[
                  styles.itemRow,
                  { borderBottomColor: theme.colors.borderSubtle },
                ]}
              >
                <View style={styles.itemRowLeft}>
                  <Text style={[styles.itemRowName, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemRowMeta, { color: theme.colors.textMuted }]}>
                    {item.quantity} {item.unit || 'AD'} × {formatCurrency(item.unitPrice)} (+%{item.taxRate} KDV)
                  </Text>
                </View>

                {/* Line Discount Input & Stepper */}
                <View style={styles.itemRowRight}>
                  <View style={styles.discountInputWrapper}>
                    <Text style={[styles.discountPercentSign, { color: theme.colors.textMuted }]}>%</Text>
                    <TextInput
                      style={[
                        styles.discountInput,
                        {
                          color: theme.colors.text,
                          backgroundColor: theme.colors.borderSubtle,
                        },
                      ]}
                      placeholder="İsk."
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numeric"
                      value={item.discount > 0 ? String(item.discount) : ''}
                      onChangeText={(val) => handleItemDiscountChange(item.productId, val)}
                    />
                  </View>

                  <Text style={[styles.itemRowTotal, { color: theme.colors.primary }]}>
                    {formatCurrency(item.quantity * item.unitPrice * (1 - item.discount / 100))}
                  </Text>

                  <TouchableOpacity
                    style={styles.deleteLineBtn}
                    onPress={() => dispatch(removeItemFromCart(item.productId))}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Delivery Address & Notes */}
          <View
            style={[
              styles.sectionBox,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Teslimat & Sipariş Notu
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>Teslimat Adresi</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="Teslimat adresi..."
                placeholderTextColor={theme.colors.textMuted}
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>Sipariş Notu</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="Müşteri talepleri, teslimat talimatı vb..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>

          {/* Comprehensive Financial Breakdown */}
          <View
            style={[
              styles.sectionBox,
              styles.totalsCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Ödeme & Tutar Dökümü</Text>

            <View style={styles.totalRow}>
              <Text style={[styles.totalKey, { color: theme.colors.textMuted }]}>Brüt Ara Toplam</Text>
              <Text style={[styles.totalVal, { color: theme.colors.text }]}>
                {formatCurrency(totals.subtotal)}
              </Text>
            </View>

            {totals.lineDiscountTotal > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalKey, { color: theme.colors.textMuted }]}>Satır İskontoları</Text>
                <Text style={[styles.totalVal, { color: theme.colors.danger }]}>
                  -{formatCurrency(totals.lineDiscountTotal)}
                </Text>
              </View>
            )}

            {/* General Discount Entry */}
            <View style={styles.totalRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.totalKey, { color: theme.colors.textMuted }]}>Genel Sepet İskontosu (%)</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  style={[
                    styles.genDiscInput,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.borderSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                  value={generalDiscountText}
                  onChangeText={handleGeneralDiscountChange}
                />
                {totals.generalDiscountTotal > 0 && (
                  <Text style={[styles.totalVal, { color: theme.colors.danger }]}>
                    -{formatCurrency(totals.generalDiscountTotal)}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalKey, { color: theme.colors.textMuted }]}>KDV Matrahı (Net)</Text>
              <Text style={[styles.totalVal, { color: theme.colors.text }]}>
                {formatCurrency(totals.taxableAmount)}
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalKey, { color: theme.colors.textMuted }]}>Hesaplanan KDV</Text>
              <Text style={[styles.totalVal, { color: theme.colors.text }]}>
                +{formatCurrency(totals.totalTax)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={styles.grandTotalRow}>
              <Text style={[styles.grandTotalLabel, { color: theme.colors.text }]}>GENEL TOPLAM</Text>
              <Text style={[styles.grandTotalValue, { color: theme.colors.primary }]}>
                {formatCurrency(totals.grandTotal)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Bottom CTA Button */}
        <View
          style={[
            styles.bottomStickyBar,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
              ...theme.shadows.md,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor: isRiskExceeded ? theme.colors.warning : theme.colors.primary,
                opacity: isSubmitting ? 0.7 : 1,
              },
            ]}
            disabled={isSubmitting}
            onPress={handleSubmitOrder}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-done-circle" size={20} color="#ffffff" />
                <Text style={styles.submitBtnText}>
                  {isRiskExceeded ? 'Riskli Siparişi Onayla' : 'Siparişi Onayla & Gönder'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 90,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1.5,
  },
  customerCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  customerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerInfo: {
    flex: 1,
  },
  customerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  customerMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  changeCustBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeCustText: {
    fontSize: 13,
    fontWeight: '700',
  },
  riskExceededBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#dc2626',
    padding: 12,
    borderRadius: 12,
  },
  riskExceededTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  riskExceededDesc: {
    color: '#fee2e2',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  sectionBox: {
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  termsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  termChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  termChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  itemRowLeft: {
    flex: 1,
  },
  itemRowName: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemRowMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  itemRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  discountPercentSign: {
    fontSize: 11,
    fontWeight: '700',
  },
  discountInput: {
    width: 38,
    height: 28,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    padding: 0,
  },
  itemRowTotal: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 70,
    textAlign: 'right',
  },
  deleteLineBtn: {
    padding: 2,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 13,
  },
  totalsCard: {
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalKey: {
    fontSize: 12,
  },
  totalVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  genDiscInput: {
    width: 36,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    padding: 0,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  grandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
