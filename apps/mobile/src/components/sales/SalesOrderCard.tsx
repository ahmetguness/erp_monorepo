import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { SalesOrder, SalesOrderStatus } from '../../services/sales.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  order: SalesOrder;
  onPress: (order: SalesOrder) => void;
  onReorder?: (order: SalesOrder) => void;
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

export const SalesOrderCard: React.FC<Props> = ({ order, onPress, onReorder }) => {
  const { theme } = useTheme();
  const cfg = STATUS_CONFIG[order.status] || { label: order.status, variant: 'neutral' as BadgeVariant };
  const itemsCount = order.items?.length ?? 0;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress(order);
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
      {/* Top row: Order Number + Status Badge */}
      <View style={styles.topRow}>
        <View style={styles.orderNumberWrap}>
          <Ionicons name="receipt-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.orderNumber, { color: theme.colors.text }]}>
            {order.number}
          </Text>
        </View>

        <Badge label={cfg.label} variant={cfg.variant} size="sm" />
      </View>

      {/* Customer Name */}
      <Text
        style={[styles.customerName, { color: theme.colors.textSecondary }]}
        numberOfLines={1}
      >
        {order.contact?.name || 'Müşteri Belirtilmedi'}
      </Text>

      {/* Info Row: Date + Items count */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={13} color={theme.colors.textMuted} />
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
            {formatDate(order.date)}
          </Text>
        </View>

        <View style={styles.metaItem}>
          <Ionicons name="cube-outline" size={13} color={theme.colors.textMuted} />
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
            {itemsCount > 0 ? `${itemsCount} Kalem Ürün` : 'Kalem Yok'}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

      {/* Bottom row: Total Amount + Quick Action */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>
            Toplam Tutar (KDV Dahil)
          </Text>
          <Text style={[styles.totalAmount, { color: theme.colors.primary }]}>
            {formatCurrency(order.totalGross)}
          </Text>
        </View>

        <View style={styles.actionsWrap}>
          {onReorder && (
            <TouchableOpacity
              style={[
                styles.reorderBtn,
                { backgroundColor: theme.colors.primaryMuted },
              ]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onReorder(order);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="repeat-outline" size={14} color={theme.colors.primary} />
              <Text style={[styles.reorderText, { color: theme.colors.primary }]}>
                Tekrarla
              </Text>
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
  orderNumberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderNumber: {
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
    gap: 16,
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
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reorderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailChevron: {
    paddingLeft: 2,
  },
});
