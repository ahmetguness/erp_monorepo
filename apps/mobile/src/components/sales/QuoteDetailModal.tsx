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
import {
  SalesQuote,
  QuoteStatus,
  convertQuoteToOrder,
  SalesOrder,
} from '../../services/sales.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  visible: boolean;
  quote: SalesQuote | null;
  onClose: () => void;
  onConvertedToOrder?: (order: SalesOrder) => void;
}

const QUOTE_STATUS_CONFIG: Record<
  QuoteStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Taslak', variant: 'neutral' },
  SENT: { label: 'İletildi', variant: 'info' },
  ACCEPTED: { label: 'Kabul Edildi', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  EXPIRED: { label: 'Süresi Doldu', variant: 'warning' },
  CANCELLED: { label: 'İptal', variant: 'danger' },
};

export const QuoteDetailModal: React.FC<Props> = ({
  visible,
  quote,
  onClose,
  onConvertedToOrder,
}) => {
  const { theme } = useTheme();
  const [isConverting, setIsConverting] = useState(false);

  if (!quote) return null;

  const cfg = QUOTE_STATUS_CONFIG[quote.status] || { label: quote.status, variant: 'neutral' as BadgeVariant };
  const canConvert = quote.status === 'DRAFT' || quote.status === 'ACCEPTED';

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const itemsText = (quote.items || [])
        .map(
          (item, idx) =>
            `${idx + 1}. ${item.product?.name || item.description || 'Ürün'} — ${item.quantity} Adet x ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.lineTotal)}`
        )
        .join('\n');

      const message = `*AXON ERP — SATIŞ TEKLİFİ*\n\n` +
        `*Teklif No:* ${quote.number}\n` +
        `*Tarih:* ${formatDate(quote.date)}\n` +
        `*Müşteri:* ${quote.contact?.name || '-'}\n` +
        (quote.validUntil ? `*Geçerlilik Tarihi:* ${formatDate(quote.validUntil)}\n` : '') +
        `*Durum:* ${cfg.label}\n\n` +
        `*TEKLİF KALEMLERİ:*\n${itemsText || 'Kalem detayı yok'}\n\n` +
        `*Ara Toplam:* ${formatCurrency(quote.totalNet)}\n` +
        `*KDV Toplamı:* ${formatCurrency(quote.totalTax)}\n` +
        `*GENEL TOPLAM:* ${formatCurrency(quote.totalGross)}\n\n` +
        (quote.notes ? `*Teklif Notları & Şartlar:* ${quote.notes}\n` : '') +
        `\nBu teklif AXON Mobil ERP üzerinden üretilmiştir.`;

      await Share.share({
        message,
        title: `Teklif ${quote.number}`,
      });
    } catch (err) {
      console.warn('[QuoteDetailModal] Share error:', err);
    }
  };

  const handleConvert = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert(
      'Siparişe Dönüştür',
      `"${quote.number}" numaralı teklif onaylanarak resmi satış siparişine dönüştürülecektir. Devam etmek istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Dönüştür',
          onPress: async () => {
            setIsConverting(true);
            try {
              const order = await convertQuoteToOrder(quote.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert(
                'Sipariş Oluşturuldu',
                `"${quote.number}" numaralı teklif başarıyla "${order.number}" numaralı siparişe dönüştürüldü.`
              );
              onConvertedToOrder?.(order);
              onClose();
            } catch (err: any) {
              Alert.alert(
                'Dönüştürme Hatası',
                err?.response?.data?.message || 'Teklif siparişe dönüştürülemedi.'
              );
            } finally {
              setIsConverting(false);
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
                {quote.number}
              </Text>
              <Badge
                label={cfg.label}
                variant={cfg.variant}
                size="sm"
              />
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {formatDate(quote.date)} tarihinde hazırlandı
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
          {/* Customer Card */}
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
              {quote.contact?.name || 'Müşteri Bilgisi Yok'}
            </Text>

            {quote.validUntil && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={14} color="#f59e0b" />
                <Text style={[styles.infoText, { color: '#d97706', fontWeight: '600' }]}>
                  Geçerlilik Tarihi: {formatDate(quote.validUntil)}
                </Text>
              </View>
            )}
          </View>

          {/* Items Card */}
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
              <Ionicons name="list-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Teklif Kalemleri ({quote.items?.length || 0})
              </Text>
            </View>

            {(quote.items || []).map((item, index) => (
              <View
                key={item.id || index}
                style={[
                  styles.itemRow,
                  {
                    borderBottomColor: theme.colors.borderSubtle,
                    borderBottomWidth: index === (quote.items?.length || 0) - 1 ? 0 : 1,
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

          {/* Notes & Terms */}
          {quote.notes ? (
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
                  Teklif Notları & Şartlar
                </Text>
              </View>
              <Text style={[styles.notesText, { color: theme.colors.textSecondary }]}>
                {quote.notes}
              </Text>
            </View>
          ) : null}

          {/* Totals Card */}
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
                {formatCurrency(quote.totalNet)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
                Toplam KDV
              </Text>
              <Text style={[styles.summaryVal, { color: theme.colors.textSecondary }]}>
                {formatCurrency(quote.totalTax)}
              </Text>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={styles.summaryRow}>
              <Text style={[styles.grandLabel, { color: theme.colors.text }]}>
                GENEL TEKLİF TUTARI
              </Text>
              <Text style={[styles.grandVal, { color: theme.colors.primary }]}>
                {formatCurrency(quote.totalGross)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
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

          {canConvert ? (
            <TouchableOpacity
              style={[styles.convertMainBtn, { backgroundColor: '#10b981' }]}
              onPress={handleConvert}
              disabled={isConverting}
              activeOpacity={0.8}
            >
              {isConverting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color="#ffffff" />
                  <Text style={styles.convertMainText}>Siparişe Dönüştür</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.disabledBtn, { backgroundColor: theme.colors.borderSubtle }]}>
              <Text style={[styles.disabledBtnText, { color: theme.colors.textMuted }]}>
                Dönüştürülemez ({quote.status})
              </Text>
            </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  convertMainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  convertMainText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  disabledBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
