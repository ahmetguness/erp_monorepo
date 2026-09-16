import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { OverdueInvoice } from '../../services/finance.service';
import { Badge } from '../common/Badge';

export interface OverdueInvoiceCardProps {
  invoice: OverdueInvoice;
  onPreview: (invoice: OverdueInvoice) => void;
  onCollect: (invoice: OverdueInvoice) => void;
}

export const OverdueInvoiceCard: React.FC<OverdueInvoiceCardProps> = ({
  invoice,
  onPreview,
  onCollect,
}) => {
  const { theme } = useTheme();

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: invoice.currencyCode || 'TRY',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatDate = (isoStr?: string | null): string => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  const phone = invoice.contact?.phone;

  const handleCall = () => {
    if (!phone) {
      Alert.alert('Bilgi', 'Müşteriye ait telefon numarası kayıtlı değil.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Hata', 'Telefon araması başlatılamadı.');
    });
  };

  const handleWhatsAppReminder = () => {
    if (!phone) {
      Alert.alert('Bilgi', 'Müşteriye ait telefon numarası kayıtlı değil.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Bilgi', 'Müşteriye ait geçerli bir telefon numarası kayıtlı değil.');
      return;
    }

    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `90${cleanPhone.substring(1)}`
      : `90${cleanPhone}`;

    const formattedAmount = formatCurrency(invoice.remainingAmount);
    const formattedDueDate = formatDate(invoice.dueDate || invoice.date);

    const message =
      `Sayın *${invoice.contact?.name || 'Müşterimiz'}*,\n\n` +
      `*${invoice.number}* numaralı, *${formattedDueDate}* vadeli faturanızın vadesi *${invoice.overdueDays} gün* geçmiştir.\n\n` +
      `📌 *Geciken Tutar:* ${formattedAmount}\n\n` +
      `Ödemenizi ivedilikle rica eder, iyi çalışmalar dileriz.\n\n` +
      `_Axon ERP Finans Yönetimi_`;

    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${phoneWithCountry}?text=${encoded}`;

    Linking.openURL(url).catch(() => {
      Alert.alert('Hata', 'WhatsApp uygulaması açılamadı.');
    });
  };

  // Severity indicator based on overdue days
  const isSevere = invoice.overdueDays > 60;
  const isModerate = invoice.overdueDays > 30;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: isSevere
            ? theme.colors.danger
            : isModerate
            ? theme.colors.warning
            : theme.colors.borderSubtle,
          ...theme.shadows.sm,
        },
      ]}
    >
      {/* Top Header: Invoice No, Badge */}
      <View style={styles.headerRow}>
        <View style={styles.invoiceIdentity}>
          <Ionicons
            name="receipt-outline"
            size={18}
            color={theme.colors.primary}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.invoiceNumber, { color: theme.colors.text }]}>
            {invoice.number}
          </Text>
        </View>

        <Badge
          label={`${invoice.overdueDays} GÜN GECİKMEDE`}
          variant={isSevere ? 'danger' : isModerate ? 'warning' : 'danger'}
        />
      </View>

      {/* Customer Name */}
      <Text
        style={[styles.customerName, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {invoice.contact?.name || 'Bilinmeyen Müşteri'}
      </Text>

      {/* Dates row */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
            Fatura Tarihi
          </Text>
          <Text style={[styles.metaValue, { color: theme.colors.text }]}>
            {formatDate(invoice.date)}
          </Text>
        </View>

        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
            Vade Tarihi
          </Text>
          <Text
            style={[
              styles.metaValue,
              {
                color: isSevere
                  ? theme.colors.danger
                  : isModerate
                  ? theme.colors.warning
                  : theme.colors.text,
                fontWeight: '600',
              },
            ]}
          >
            {formatDate(invoice.dueDate || invoice.date)}
          </Text>
        </View>

        <View style={[styles.metaItem, { alignItems: 'flex-end' }]}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>
            Açık Tutar
          </Text>
          <Text
            style={[
              styles.amountValue,
              { color: isSevere ? theme.colors.danger : theme.colors.text },
            ]}
          >
            {formatCurrency(invoice.remainingAmount)}
          </Text>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View
        style={[
          styles.actionRow,
          { borderTopColor: theme.colors.borderSubtle },
        ]}
      >
        {/* Call Button */}
        <TouchableOpacity
          style={[styles.btnAction, { backgroundColor: '#eff6ff' }]}
          onPress={handleCall}
          activeOpacity={0.7}
        >
          <Ionicons name="call" size={15} color="#2563eb" />
          <Text style={[styles.btnActionText, { color: '#2563eb' }]}>Ara</Text>
        </TouchableOpacity>

        {/* WhatsApp Reminder Button */}
        <TouchableOpacity
          style={[styles.btnAction, { backgroundColor: '#ecfdf5' }]}
          onPress={handleWhatsAppReminder}
          activeOpacity={0.7}
        >
          <Ionicons name="logo-whatsapp" size={15} color="#10b981" />
          <Text style={[styles.btnActionText, { color: '#10b981' }]}>
            WhatsApp
          </Text>
        </TouchableOpacity>

        {/* Preview Button */}
        <TouchableOpacity
          style={[styles.btnAction, { backgroundColor: theme.colors.surface }]}
          onPress={() => onPreview(invoice)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="document-text-outline"
            size={15}
            color={theme.colors.text}
          />
          <Text style={[styles.btnActionText, { color: theme.colors.text }]}>
            İncele
          </Text>
        </TouchableOpacity>

        {/* Collect (Tahsil Et) Button */}
        <TouchableOpacity
          style={[
            styles.btnAction,
            styles.btnCollect,
            { backgroundColor: theme.colors.primary },
          ]}
          onPress={() => onCollect(invoice)}
          activeOpacity={0.7}
        >
          <Ionicons name="wallet-outline" size={15} color="#ffffff" />
          <Text style={[styles.btnActionText, { color: '#ffffff' }]}>
            Tahsil Et
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  invoiceIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  amountValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  btnAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  btnCollect: {
    flex: 1.2,
  },
  btnActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
