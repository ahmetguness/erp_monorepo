import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { SalesOrder } from '../../services/sales.service';
import { formatCurrency, formatDate } from '../../lib/utils';

export interface OrderSuccessModalProps {
  visible: boolean;
  order: SalesOrder | null;
  onClose: () => void;
  onNewOrder: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  visible,
  order,
  onClose,
  onNewOrder,
}) => {
  const { theme } = useTheme();

  if (!order) return null;

  const buildShareText = () => {
    const customerName = order.contact?.name || 'Müşteri';
    const lines = (order.items || [])
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.product?.name || 'Ürün'} - ${i.quantity} adet × ${formatCurrency(
            i.unitPrice
          )} = ${formatCurrency(i.lineTotal)}`
      )
      .join('\n');

    return `*AXON ERP SİPARİŞ BİLGİSİ*\n` +
      `Sipariş No: ${order.number}\n` +
      `Müşteri: ${customerName}\n` +
      `Tarih: ${formatDate(order.date)}\n` +
      (order.dueDate ? `Vade: ${formatDate(order.dueDate)}\n` : '') +
      `------------------------\n` +
      `${lines}\n` +
      `------------------------\n` +
      `Toplam KDV: ${formatCurrency(order.totalTax)}\n` +
      `*GENEL TOPLAM: ${formatCurrency(order.totalGross)}*\n\n` +
      `Siparişiniz başarıyla sisteme alınmıştır. Teşekkür ederiz.`;
  };

  const handleShareWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const text = encodeURIComponent(buildShareText());
    Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {});
  };

  const handleNativeShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share({
        title: `Sipariş Özeti - ${order.number}`,
        message: buildShareText(),
      });
    } catch {
      // Non-fatal
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderRadius: theme.borderRadius.xl,
              ...theme.shadows.lg,
            },
          ]}
        >
          {/* Success Check Icon */}
          <View style={styles.successIconBadge}>
            <Ionicons name="checkmark" size={36} color="#ffffff" />
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>
            Sipariş Oluşturuldu!
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Sipariş başarıyla sisteme işlendi ve onaya sunuldu.
          </Text>

          {/* Receipt Info Box */}
          <View
            style={[
              styles.receiptBox,
              {
                backgroundColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: theme.colors.textMuted }]}>Sipariş No</Text>
              <Text style={[styles.receiptValue, { color: theme.colors.primary }]}>
                {order.number}
              </Text>
            </View>

            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: theme.colors.textMuted }]}>Müşteri</Text>
              <Text style={[styles.receiptValue, { color: theme.colors.text }]} numberOfLines={1}>
                {order.contact?.name || 'Müşteri'}
              </Text>
            </View>

            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: theme.colors.textMuted }]}>Kalem Sayısı</Text>
              <Text style={[styles.receiptValue, { color: theme.colors.text }]}>
                {order.items?.length || 0} Kalem
              </Text>
            </View>

            <View style={[styles.receiptDivider, { backgroundColor: theme.colors.border }]} />

            <View style={styles.receiptRow}>
              <Text style={[styles.receiptTotalLabel, { color: theme.colors.text }]}>Genel Toplam</Text>
              <Text style={[styles.receiptTotalValue, { color: theme.colors.primary }]}>
                {formatCurrency(order.totalGross)}
              </Text>
            </View>
          </View>

          {/* Share Action Buttons */}
          <View style={styles.shareButtonsRow}>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
              onPress={handleShareWhatsApp}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#10b981" />
              <Text style={[styles.shareBtnText, { color: '#047857' }]}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.shareBtn,
                { backgroundColor: theme.colors.borderSubtle, borderColor: theme.colors.border },
              ]}
              onPress={handleNativeShare}
              activeOpacity={0.7}
            >
              <Ionicons name="share-social-outline" size={18} color={theme.colors.text} />
              <Text style={[styles.shareBtnText, { color: theme.colors.text }]}>Paylaş</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Action Buttons */}
          <View style={styles.mainButtonsCol}>
            <TouchableOpacity
              style={[styles.newOrderBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onClose();
                onNewOrder();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#ffffff" />
              <Text style={styles.newOrderBtnText}>Yeni Sipariş Başlat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.dismissBtnText, { color: theme.colors.textMuted }]}>
                Kapat
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  successIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  receiptBox: {
    width: '100%',
    padding: 14,
    gap: 8,
    marginTop: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptLabel: {
    fontSize: 12,
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 200,
  },
  receiptDivider: {
    height: 1,
    marginVertical: 2,
  },
  receiptTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  receiptTotalValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  shareButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginTop: 4,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mainButtonsCol: {
    width: '100%',
    gap: 8,
    marginTop: 6,
  },
  newOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  newOrderBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
