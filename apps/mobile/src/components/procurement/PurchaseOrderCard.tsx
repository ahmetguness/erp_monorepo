import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { PurchaseOrder, PurchaseOrderStatus } from '../../services/procurement.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  order: PurchaseOrder;
  onPress: (order: PurchaseOrder) => void;
  onReceive?: (order: PurchaseOrder) => void;
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

export const PurchaseOrderCard: React.FC<Props> = ({ order, onPress, onReceive }) => {
  const { theme } = useTheme();
  const cfg = STATUS_CONFIG[order.status] || { label: order.status, variant: 'neutral' as BadgeVariant };
  const canReceive = order.status !== 'RECEIVED' && order.status !== 'CANCELLED';
  const itemsCount = order.items?.length ?? order._count?.items ?? 0;

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
      {/* Top Row: PO Number + Status Badge */}
      <View style={styles.topRow}>
        <View style={styles.orderNumberWrap}>
          <Ionicons name="cart-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.orderNumber, { color: theme.colors.text }]}>
            {order.number}
          </Text>
        </View>

        <Badge label={cfg.label} variant={cfg.variant} size="sm" />
      </View>

      {/* Supplier Name */}
      <Text style={[styles.supplierName, { color: theme.colors.textSecondary }]} numberOfLines={1}>
        {order.contact?.name || 'Tedarikçi Belirtilmedi'}
      </Text>

      {/* Dates and Items summary */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
          Tarih: {formatDate(order.date)}
        </Text>
        {order.dueDate && (
          <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
            • Teslimat: {formatDate(order.dueDate)}
          </Text>
        )}
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
          • {itemsCount} Kalem
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

      {/* Bottom Row: Amount + Quick Receive */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>
            Sipariş Tutarı (KDV Dahil)
          </Text>
          <Text style={[styles.totalAmount, { color: theme.colors.primary }]}>
            {formatCurrency(order.totalGross)}
          </Text>
        </View>

        <View style={styles.actionsWrap}>
          {canReceive && onReceive && (
            <TouchableOpacity
              style={[styles.receiveBtn, { backgroundColor: '#ecfdf5', borderColor: '#10b981' }]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onReceive(order);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="cube-outline" size={14} color="#059669" />
              <Text style={styles.receiveBtnText}>Mal Kabul</Text>
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
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderNumberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  supplierName: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  totalAmount: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  receiveBtnText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  detailChevron: {
    marginLeft: 2,
  },
});
