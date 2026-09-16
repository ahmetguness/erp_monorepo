import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { SalesOrder, SalesOrderStatus, cancelSalesOrder } from '../../services/sales.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';
import {
  thermalPrinterService,
  generateOrderReceipt,
} from '../../services/thermal-printer.service';

interface Props {
  visible: boolean;
  order: SalesOrder | null;
  onClose: () => void;
  onReorder: (order: SalesOrder) => void;
  onOrderCancelled?: (orderId: string) => void;
}

const STATUS_CONFIG: Record<
  SalesOrderStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Taslak', variant: 'neutral' },
  CONFIRMED: { label: 'Onaylandı', variant: 'info' },
  PARTIALLY_DELIVERED: { label: 'Kısmi Sevk', variant: 'warning' },
  DELIVERED: { label: 'Teslim Edildi', variant: 'success' },
  CANCELLED: { label: 'İptal Edildi', variant: 'danger' },
};

export const OrderDetailModal: React.FC<Props> = ({
  visible,
  order,
  onClose,
  onReorder,
  onOrderCancelled,
}) => {
  const { theme } = useTheme();
  const [isCancelling, setIsCancelling] = useState(false);

  if (!order) return null;

  const cfg = STATUS_CONFIG[order.status] || { label: order.status, variant: 'neutral' as BadgeVariant };
  const canCancel = order.status === 'DRAFT' || order.status === 'CONFIRMED';

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const itemsText = (order.items || [])
        .map(
          (item, idx) =>
            `${idx + 1}. ${item.product?.name || item.description || 'Ürün'} — ${item.quantity} Adet x ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.lineTotal)}`
        )
        .join('\n');

      const message = `*AXON ERP — SİPARİŞ BİLGİSİ*\n\n` +
        `*Sipariş No:* ${order.number}\n` +
        `*Tarih:* ${formatDate(order.date)}\n` +
        `*Müşteri:* ${order.contact?.name || '-'}\n` +
        (order.dueDate ? `*Vade Tarihi:* ${formatDate(order.dueDate)}\n` : '') +
        `*Durum:* ${cfg.label}\n\n` +
        `*KALEMLER:*\n${itemsText || 'Kalem detayı yok'}\n\n` +
        `*Ara Toplam:* ${formatCurrency(order.totalNet)}\n` +
        `*KDV Toplamı:* ${formatCurrency(order.totalTax)}\n` +
        `*GENEL TOPLAM:* ${formatCurrency(order.totalGross)}\n\n` +
        (order.notes ? `*Notlar:* ${order.notes}\n` : '') +
        `\nBu belge AXON Mobil ERP üzerinden oluşturulmuştur.`;

      await Share.share({
        message,
        title: `Sipariş ${order.number}`,
      });
    } catch (err) {
      console.warn('[OrderDetailModal] Share error:', err);
    }
  };

  const handleCancelOrder = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      'Siparişi İptal Et',
      `"${order.number}" numaralı siparişi iptal etmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, İptal Et',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              await cancelSalesOrder(order.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert('İptal Edildi', 'Sipariş başarıyla iptal edildi.');
              onOrderCancelled?.(order.id);
              onClose();
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.message || 'Sipariş iptal edilemedi.');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  const handlePrintReceipt = async () => {
    if (!order) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const { bytes } = generateOrderReceipt(order);
      const res = await thermalPrinterService.print(
        bytes,
        `Sipariş Fişi - ${order.number || order.id.slice(0, 8)}`
      );
      Alert.alert(res.success ? 'Yazdırıldı' : 'Yazıcı Uyarısı', res.message);
    } catch {
      Alert.alert('Hata', 'Yazdırma işlemi gerçekleştirilemedi.');
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
          <View>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {order.number}
              </Text>
              <Badge
                label={cfg.label}
                variant={cfg.variant}
                size="sm"
              />
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {formatDate(order.date)} tarihinde oluşturuldu
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Customer Info Card */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="business-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Müşteri Bilgileri
              </Text>
            </View>

            <Text style={[styles.customerName, { color: theme.colors.text }]}>
              {order.contact?.name || 'Müşteri Bilgisi Yok'}
            </Text>

            {order.contact?.phone && (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={14} color={theme.colors.textMuted} />
                <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                  {order.contact.phone}
                </Text>
              </View>
            )}

            {order.dueDate && (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={14} color={theme.colors.textMuted} />
                <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                  Vade Tarihi: {formatDate(order.dueDate)}
                </Text>
              </View>
            )}
          </View>

          {/* Items Breakdown */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="cart-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Sipariş Kalemleri ({order.items?.length || 0})
              </Text>
            </View>

            {(order.items || []).map((item, index) => (
              <View
                key={item.id || index}
                style={[
                  styles.itemRow,
                  {
                    borderBottomColor: theme.colors.borderSubtle,
                    borderBottomWidth: index === (order.items?.length || 0) - 1 ? 0 : 1,
                  },
                ]}
              >
                <View style={styles.itemLeft}>
                  <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={2}>
                    {item.product?.name || item.description || 'Ürün'}
                  </Text>
                  <Text style={[styles.itemSku, { color: theme.colors.textMuted }]}>
                    Kod: {item.product?.code || '-'}
                  </Text>
                  <Text style={[styles.itemSub, { color: theme.colors.textSecondary }]}>
                    {item.quantity} Adet x {formatCurrency(item.unitPrice)}
                    {item.discount > 0 ? ` (İsk: %${item.discount})` : ''}
                  </Text>
                </View>

                <View style={styles.itemRight}>
                  <Text style={[styles.itemTotal, { color: theme.colors.text }]}>
                    {formatCurrency(item.lineTotal)}
                  </Text>
                  <Text style={[styles.itemTax, { color: theme.colors.textMuted }]}>
                    KDV %{item.taxRate}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Notes Card */}
          {order.notes ? (
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Ionicons name="document-text-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Sipariş Notu
                </Text>
              </View>
              <Text style={[styles.notesText, { color: theme.colors.textSecondary }]}>
                {order.notes}
              </Text>
            </View>
          ) : null}

          {/* Financial Totals */}
          <View
            style={[
              styles.totalsCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
                Ara Toplam (Net)
              </Text>
              <Text style={[styles.summaryVal, { color: theme.colors.textSecondary }]}>
                {formatCurrency(order.totalNet)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
                Toplam KDV
              </Text>
              <Text style={[styles.summaryVal, { color: theme.colors.textSecondary }]}>
                {formatCurrency(order.totalTax)}
              </Text>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={styles.summaryRow}>
              <Text style={[styles.grandLabel, { color: theme.colors.text }]}>
                GENEL TOPLAM
              </Text>
              <Text style={[styles.grandVal, { color: theme.colors.primary }]}>
                {formatCurrency(order.totalGross)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.shareBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Ionicons name="share-social-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.shareBtnText, { color: theme.colors.text }]}>Paylaş</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.shareBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={handlePrintReceipt}
            activeOpacity={0.7}
          >
            <Ionicons name="print-outline" size={18} color={theme.colors.primary} />
            <Text style={[styles.shareBtnText, { color: theme.colors.primary }]}>Fiş Yazdır</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.reorderMainBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onClose();
              onReorder(order);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="repeat-outline" size={18} color="#ffffff" />
            <Text style={styles.reorderMainText}>Tekrar Sipariş Ver</Text>
          </TouchableOpacity>

          {canCancel && (
            <TouchableOpacity
              style={[
                styles.cancelBtn,
                {
                  backgroundColor: '#fee2e2',
                  borderColor: '#fca5a5',
                },
              ]}
              onPress={handleCancelOrder}
              disabled={isCancelling}
              activeOpacity={0.7}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#dc2626" />
              ) : (
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              )}
            </TouchableOpacity>
          )}
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
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  sectionCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  infoText: {
    fontSize: 13,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  itemLeft: {
    flex: 1,
    paddingRight: 10,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemSku: {
    fontSize: 11,
    marginTop: 2,
  },
  itemSub: {
    fontSize: 12,
    marginTop: 3,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemTax: {
    fontSize: 10,
    marginTop: 2,
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  totalsCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    marginVertical: 8,
  },
  grandLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  grandVal: {
    fontSize: 17,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reorderMainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  reorderMainText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
