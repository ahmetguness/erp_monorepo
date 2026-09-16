import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { PurchaseRequest, PurchaseRequestStatus } from '../../services/procurement.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  request: PurchaseRequest;
  onPress: (request: PurchaseRequest) => void;
  onApprove?: (request: PurchaseRequest) => void;
  onConvert?: (request: PurchaseRequest) => void;
}

const STATUS_CONFIG: Record<
  PurchaseRequestStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Taslak', variant: 'neutral' },
  PENDING_APPROVAL: { label: 'Onay Bekliyor', variant: 'warning' },
  APPROVED: { label: 'Onaylandı', variant: 'info' },
  ORDERED: { label: 'Sipariş Verildi', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'danger' },
};

export const PurchaseRequestCard: React.FC<Props> = ({
  request,
  onPress,
  onApprove,
  onConvert,
}) => {
  const { theme } = useTheme();
  const cfg = STATUS_CONFIG[request.status] || { label: request.status, variant: 'neutral' as BadgeVariant };
  const itemsCount = request.items?.length ?? 0;
  const canApprove = request.status === 'DRAFT' || request.status === 'PENDING_APPROVAL';
  const canConvert = request.status === 'APPROVED';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress(request);
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
      {/* Top Row: PR Number + Status */}
      <View style={styles.topRow}>
        <View style={styles.numberWrap}>
          <Ionicons name="clipboard-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.reqNumber, { color: theme.colors.text }]}>
            {request.number}
          </Text>
        </View>

        <Badge label={cfg.label} variant={cfg.variant} size="sm" />
      </View>

      {/* Date & Department Notes */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
          Tarih: {formatDate(request.date)}
        </Text>
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
          • {itemsCount} Kalem Talep
        </Text>
      </View>

      {request.notes && (
        <Text style={[styles.notes, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          Gerekçe: {request.notes}
        </Text>
      )}

      {/* Items Preview */}
      {itemsCount > 0 && request.items && request.items[0] && (
        <View style={[styles.previewBox, { backgroundColor: theme.colors.surface }]}>
          <Ionicons name="cube-outline" size={13} color={theme.colors.textMuted} />
          <Text style={[styles.previewText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {request.items[0].product?.name || request.items[0].description || 'Kalem'} ({request.items[0].quantity} Adet)
            {itemsCount > 1 ? ` ve ${itemsCount - 1} kalem daha` : ''}
          </Text>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

      {/* Bottom Row: Estimated Cost + Action Button */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>
            Tahmini Maliyet
          </Text>
          <Text style={[styles.totalAmount, { color: theme.colors.text }]}>
            {request.totalEstimated ? formatCurrency(request.totalEstimated) : 'Belirtilmedi'}
          </Text>
        </View>

        <View style={styles.actionsWrap}>
          {canApprove && onApprove && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#eff6ff', borderColor: '#3b82f6' }]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onApprove(request);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#2563eb" />
              <Text style={[styles.actionBtnText, { color: '#2563eb' }]}>Onayla</Text>
            </TouchableOpacity>
          )}

          {canConvert && onConvert && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#ecfdf5', borderColor: '#10b981' }]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onConvert(request);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="cart-outline" size={14} color="#059669" />
              <Text style={[styles.actionBtnText, { color: '#059669' }]}>Siparişe Çevir</Text>
            </TouchableOpacity>
          )}

          {request.purchaseOrder && (
            <View style={[styles.poBadge, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="link-outline" size={12} color={theme.colors.primary} />
              <Text style={[styles.poBadgeText, { color: theme.colors.primary }]}>
                {request.purchaseOrder.number}
              </Text>
            </View>
          )}

          <View style={styles.chevronWrap}>
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
  numberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reqNumber: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 11,
  },
  notes: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  previewText: {
    fontSize: 11,
    flex: 1,
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
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  poBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  poBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chevronWrap: {
    marginLeft: 2,
  },
});
