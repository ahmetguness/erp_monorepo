import React, { useState, useEffect } from 'react';
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
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseThreeWayMatch,
  sendPurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrderThreeWayMatch,
} from '../../services/procurement.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  visible: boolean;
  order: PurchaseOrder | null;
  onClose: () => void;
  onReceiveGoods?: (order: PurchaseOrder) => void;
  onOrderUpdated?: (order: PurchaseOrder) => void;
  onOrderCancelled?: (orderId: string) => void;
}

const STATUS_CONFIG: Record<
  PurchaseOrderStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Taslak', variant: 'neutral' },
  SENT: { label: 'Gönderildi', variant: 'info' },
  PARTIALLY_RECEIVED: { label: 'Kısmi Teslim', variant: 'warning' },
  RECEIVED: { label: 'Teslim Alındı', variant: 'success' },
  CANCELLED: { label: 'İptal Edildi', variant: 'danger' },
};

export const PurchaseOrderDetailModal: React.FC<Props> = ({
  visible,
  order,
  onClose,
  onReceiveGoods,
  onOrderUpdated,
  onOrderCancelled,
}) => {
  const { theme } = useTheme();
  const [matchData, setMatchData] = useState<PurchaseThreeWayMatch | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (visible && order) {
      getPurchaseOrderThreeWayMatch(order.id)
        .then(setMatchData)
        .catch(() => {});
    }
  }, [visible, order]);

  if (!order) return null;

  const cfg = STATUS_CONFIG[order.status] || { label: order.status, variant: 'neutral' as BadgeVariant };
  const canSend = order.status === 'DRAFT';
  const canReceive = order.status !== 'RECEIVED' && order.status !== 'CANCELLED';
  const canCancel = order.status === 'DRAFT' || order.status === 'SENT';

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const itemsText = (order.items || [])
        .map(
          (item, idx) =>
            `${idx + 1}. ${item.product?.name || item.description || 'Ürün'} — ${item.quantity} Adet x ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.lineTotal)} (Teslim Alınan: ${item.received || 0})`
        )
        .join('\n');

      const message = `*AXON ERP — SATIN ALMA SİPARİŞİ (PO)*\n\n` +
        `*Sipariş No:* ${order.number}\n` +
        `*Tarih:* ${formatDate(order.date)}\n` +
        `*Tedarikçi:* ${order.contact?.name || '-'}\n` +
        (order.dueDate ? `*Teslimat Tarihi:* ${formatDate(order.dueDate)}\n` : '') +
        `*Durum:* ${cfg.label}\n\n` +
        `*KALEMLER:*\n${itemsText || 'Kalem detayı yok'}\n\n` +
        `*Ara Toplam:* ${formatCurrency(order.totalNet)}\n` +
        `*KDV Toplamı:* ${formatCurrency(order.totalTax)}\n` +
        `*GENEL TOPLAM:* ${formatCurrency(order.totalGross)}\n\n` +
        (order.notes ? `*Notlar:* ${order.notes}\n` : '') +
        `\nBu satın alma siparişi AXON Mobil ERP üzerinden üretilmiştir.`;

      await Share.share({
        message,
        title: `Satın Alma Siparişi ${order.number}`,
      });
    } catch (err) {
      console.warn('[PurchaseOrderDetailModal] Share error:', err);
    }
  };

  const handleSendOrder = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSending(true);
    try {
      const updated = await sendPurchaseOrder(order.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Gönderildi', `"${order.number}" numaralı sipariş tedarikçiye gönderildi olarak güncellendi.`);
      onOrderUpdated?.(updated);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Sipariş gönderilemedi.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCancelOrder = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      'Siparişi İptal Et',
      `"${order.number}" numaralı satın alma siparişini iptal etmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, İptal Et',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              await cancelPurchaseOrder(order.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert('İptal Edildi', 'Satın alma siparişi iptal edildi.');
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
              <Badge label={cfg.label} variant={cfg.variant} size="sm" />
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
          {/* Supplier Info Card */}
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
                Tedarikçi Bilgisi
              </Text>
            </View>
            <Text style={[styles.supplierName, { color: theme.colors.text }]}>
              {order.contact?.name || 'Tedarikçi Bilgisi Yok'}
            </Text>
            {order.contact?.phone && (
              <Text style={[styles.infoSub, { color: theme.colors.textSecondary }]}>
                İletişim: {order.contact.phone}
              </Text>
            )}
            {order.dueDate && (
              <Text style={[styles.infoSub, { color: theme.colors.textMuted }]}>
                Beklenen Teslimat: {formatDate(order.dueDate)}
              </Text>
            )}
          </View>

          {/* 3-Way Match Card */}
          {matchData && (
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
                <Ionicons name="git-compare-outline" size={16} color="#8b5cf6" />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  3-Way Match (Sipariş - Depo - Fatura)
                </Text>
              </View>

              <View style={styles.matchGrid}>
                <View style={styles.matchCol}>
                  <Text style={[styles.matchLabel, { color: theme.colors.textMuted }]}>Sipariş</Text>
                  <Text style={[styles.matchVal, { color: theme.colors.text }]}>
                    {matchData.orderedQty} Adet
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={theme.colors.textMuted} />
                <View style={styles.matchCol}>
                  <Text style={[styles.matchLabel, { color: theme.colors.textMuted }]}>Teslim Alınan</Text>
                  <Text style={[styles.matchVal, { color: '#059669' }]}>
                    {matchData.receivedQty} Adet
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={theme.colors.textMuted} />
                <View style={styles.matchCol}>
                  <Text style={[styles.matchLabel, { color: theme.colors.textMuted }]}>Faturalanan</Text>
                  <Text style={[styles.matchVal, { color: '#2563eb' }]}>
                    {matchData.invoicedQty} Adet
                  </Text>
                </View>
              </View>
            </View>
          )}

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
              <Ionicons name="cube-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Sipariş Kalemleri ({order.items?.length || 0})
              </Text>
            </View>

            {(order.items || []).map((item, index) => {
              const isFullyReceived = (item.received || 0) >= item.quantity;
              return (
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
                      SKU: {item.product?.code || '-'} • Birim: {formatCurrency(item.unitPrice)}
                    </Text>

                    {/* Delivery status indicator */}
                    <View style={styles.deliveryBadgeRow}>
                      <Badge
                        label={`${item.received || 0} / ${item.quantity} Adet Teslim Alındı`}
                        variant={isFullyReceived ? 'success' : (item.received || 0) > 0 ? 'warning' : 'neutral'}
                        size="sm"
                      />
                    </View>
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
              );
            })}
          </View>

          {/* Financial Totals */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 8 }]}>
              Ödeme ve Tutar
            </Text>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>Ara Toplam</Text>
              <Text style={[styles.summaryVal, { color: theme.colors.text }]}>
                {formatCurrency(order.totalNet)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>KDV Toplamı</Text>
              <Text style={[styles.summaryVal, { color: theme.colors.text }]}>
                +{formatCurrency(order.totalTax)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={styles.grandTotalRow}>
              <Text style={[styles.grandTotalLabel, { color: theme.colors.text }]}>GENEL TOPLAM</Text>
              <Text style={[styles.grandTotalValue, { color: theme.colors.primary }]}>
                {formatCurrency(order.totalGross)}
              </Text>
            </View>
          </View>

          {/* Notes */}
          {order.notes && (
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Sipariş Notları</Text>
              <Text style={[styles.notesText, { color: theme.colors.textSecondary }]}>
                {order.notes}
              </Text>
            </View>
          )}
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
            style={[styles.shareBtn, { borderColor: theme.colors.border }]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Ionicons name="share-social-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>

          {canSend && (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: '#3b82f6' }]}
              onPress={handleSendOrder}
              disabled={isSending}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#ffffff" />
                  <Text style={styles.actionBtnText}>Tedarikçiye Gönder</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {canReceive && onReceiveGoods && (
            <TouchableOpacity
              style={[styles.receiveActionBtn, { backgroundColor: '#10b981' }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onClose();
                onReceiveGoods(order);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="cube" size={16} color="#ffffff" />
              <Text style={styles.actionBtnText}>Mal Kabul Yap</Text>
            </TouchableOpacity>
          )}

          {canCancel && (
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: theme.colors.danger }]}
              onPress={handleCancelOrder}
              disabled={isCancelling}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={16} color={theme.colors.danger} />
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
    gap: 12,
  },
  sectionCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoSub: {
    fontSize: 12,
  },
  matchGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  matchCol: {
    alignItems: 'center',
  },
  matchLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  matchVal: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
  },
  itemLeft: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemSku: {
    fontSize: 11,
    marginTop: 2,
  },
  deliveryBadgeRow: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemTax: {
    fontSize: 10,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  summaryKey: {
    fontSize: 12,
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 6,
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
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  notesText: {
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  shareBtn: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  receiveActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  cancelBtn: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
