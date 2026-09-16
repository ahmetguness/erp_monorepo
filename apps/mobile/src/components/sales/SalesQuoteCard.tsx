import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { SalesQuote, QuoteStatus } from '../../services/sales.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  quote: SalesQuote;
  onPress: (quote: SalesQuote) => void;
  onConvert?: (quote: SalesQuote) => void;
  onConvertToOrder?: (quote: SalesQuote) => void;
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

export const SalesQuoteCard: React.FC<Props> = ({ quote, onPress, onConvert, onConvertToOrder }) => {
  const { theme } = useTheme();
  const handleConvert = onConvertToOrder || onConvert;
  const cfg = QUOTE_STATUS_CONFIG[quote.status] || { label: quote.status, variant: 'neutral' as BadgeVariant };
  const canConvert = quote.status === 'DRAFT' || quote.status === 'ACCEPTED';
  const itemsCount = quote.items?.length ?? 0;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress(quote);
      }}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.borderSubtle,
          borderRadius: theme.borderRadius.lg,
          ...theme.shadows.sm,
        },
      ]}
    >
      {/* Top row: Quote Number + Status */}
      <View style={styles.topRow}>
        <View style={styles.quoteNumberWrap}>
          <Ionicons name="document-text-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.quoteNumber, { color: theme.colors.text }]}>
            {quote.number}
          </Text>
        </View>

        <Badge label={cfg.label} variant={cfg.variant} size="sm" />
      </View>

      {/* Customer Name */}
      <Text
        style={[styles.customerName, { color: theme.colors.textSecondary }]}
        numberOfLines={1}
      >
        {quote.contact?.name || 'Müşteri Belirtilmedi'}
      </Text>

      {/* Meta Row: Date & Valid Until */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={13} color={theme.colors.textMuted} />
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
            {formatDate(quote.date)}
          </Text>
        </View>

        {quote.validUntil && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={theme.colors.textMuted} />
            <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
              Son: {formatDate(quote.validUntil)}
            </Text>
          </View>
        )}

        <View style={styles.metaItem}>
          <Ionicons name="cube-outline" size={13} color={theme.colors.textMuted} />
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
            {itemsCount} Kalem
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

      {/* Bottom row: Total Amount + Quick Action */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>
            Teklif Tutarı (KDV Dahil)
          </Text>
          <Text style={[styles.totalAmount, { color: theme.colors.primary }]}>
            {formatCurrency(quote.totalGross)}
          </Text>
        </View>

        <View style={styles.actionsWrap}>
          {canConvert && handleConvert && (
            <TouchableOpacity
              style={[
                styles.convertBtn,
                { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
              ]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                handleConvert(quote);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
              <Text style={styles.convertText}>Siparişe Çevir</Text>
            </TouchableOpacity>
          )}

          <View style={styles.detailChevron}>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  quoteNumberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quoteNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  customerName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  convertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  convertText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  detailChevron: {
    paddingLeft: 2,
  },
});
