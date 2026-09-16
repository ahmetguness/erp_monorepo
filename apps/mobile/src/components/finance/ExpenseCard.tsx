import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  ExpenseRecord,
  ExpenseCategory,
  ExpenseStatus,
} from '../../services/finance.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  expense?: ExpenseRecord;
  item?: ExpenseRecord;
  onPress?: (expense: ExpenseRecord) => void;
  onApprove?: (expense: ExpenseRecord) => void;
  onReject?: (expense: ExpenseRecord) => void;
}

const CATEGORY_MAP: Record<
  ExpenseCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  FOOD: { label: 'Yemek & İçecek', icon: 'restaurant-outline', color: '#f59e0b', bg: '#fef3c7' },
  FUEL: { label: 'Akaryakıt & Yakıt', icon: 'car-outline', color: '#ef4444', bg: '#fee2e2' },
  ACCOMMODATION: { label: 'Konaklama / Otel', icon: 'bed-outline', color: '#8b5cf6', bg: '#ede9fe' },
  TRANSPORT: { label: 'Ulaşım & Taksi', icon: 'bus-outline', color: '#06b6d4', bg: '#cffafe' },
  HOSPITALITY: { label: 'Temsil & Ağırlama', icon: 'cafe-outline', color: '#10b981', bg: '#d1fae5' },
  OFFICE: { label: 'Ofis & Sarf', icon: 'briefcase-outline', color: '#6366f1', bg: '#e0e7ff' },
  OTHER: { label: 'Diğer Harcama', icon: 'receipt-outline', color: '#64748b', bg: '#f1f5f9' },
};

const STATUS_MAP: Record<
  ExpenseStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Taslak', variant: 'neutral' },
  PENDING_APPROVAL: { label: 'Onay Bekliyor', variant: 'warning' },
  APPROVED: { label: 'Onaylandı', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  REIMBURSED: { label: 'Ödendi', variant: 'info' },
};

export const ExpenseCard: React.FC<Props> = ({
  expense: propExpense,
  item: propItem,
  onPress,
  onApprove,
  onReject,
}) => {
  const expense = propExpense || propItem;
  const { theme } = useTheme();

  if (!expense) return null;

  const cat = CATEGORY_MAP[expense.category] || CATEGORY_MAP.OTHER;
  const statusCfg = STATUS_MAP[expense.status] || { label: expense.status, variant: 'neutral' as BadgeVariant };
  const isOutOfPocket = expense.paymentMethod === 'OUT_OF_POCKET';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(expense);
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
      {/* Top Row: Category Icon & Title + Status */}
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <View style={[styles.catIconBox, { backgroundColor: cat.bg }]}>
            <Ionicons name={cat.icon} size={16} color={cat.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.titleText, { color: theme.colors.text }]} numberOfLines={1}>
              {expense.title}
            </Text>
            <Text style={[styles.catText, { color: theme.colors.textMuted }]}>
              {cat.label} • {formatDate(expense.date)}
            </Text>
          </View>
        </View>

        <Badge label={statusCfg.label} variant={statusCfg.variant} size="sm" />
      </View>

      {/* Mid Row: Payment Method Tag & Notes */}
      <View style={styles.paymentMethodRow}>
        <View
          style={[
            styles.paymentTag,
            { backgroundColor: isOutOfPocket ? '#fef3c7' : '#eff6ff' },
          ]}
        >
          <Ionicons
            name={isOutOfPocket ? 'wallet-outline' : 'card-outline'}
            size={12}
            color={isOutOfPocket ? '#b45309' : '#1d4ed8'}
          />
          <Text
            style={[
              styles.paymentTagText,
              { color: isOutOfPocket ? '#b45309' : '#1d4ed8' },
            ]}
          >
            {isOutOfPocket ? 'Personel Cebinden (İade)' : 'Şirket Kredi Kartı'}
          </Text>
        </View>

        {expense.receiptPhotoUri && (
          <View style={styles.hasPhotoTag}>
            <Ionicons name="camera" size={12} color={theme.colors.primary} />
            <Text style={[styles.hasPhotoText, { color: theme.colors.primary }]}>
              Fiş Eklendi
            </Text>
          </View>
        )}
      </View>

      {expense.notes && (
        <Text style={[styles.notesText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          Not: {expense.notes}
        </Text>
      )}

      {/* Receipt Image Thumbnail preview (if available) */}
      {expense.receiptPhotoUri && (
        <View style={styles.thumbWrapper}>
          <Image source={{ uri: expense.receiptPhotoUri }} style={styles.receiptThumb} resizeMode="cover" />
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

      {/* Bottom Row: Amount breakdown + Manager Approval CTA */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.amountSub, { color: theme.colors.textMuted }]}>
            KDV (%{expense.taxRate}): {formatCurrency(expense.taxAmount)}
          </Text>
          <Text style={[styles.amountTotal, { color: theme.colors.text }]}>
            {formatCurrency(expense.totalAmount)}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          {expense.status === 'PENDING_APPROVAL' && onApprove && (
            <TouchableOpacity
              style={[styles.quickApproveBtn, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onApprove(expense);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
              <Text style={[styles.quickApproveText, { color: '#059669' }]}>Onayla</Text>
            </TouchableOpacity>
          )}

          {expense.status === 'PENDING_APPROVAL' && onReject && (
            <TouchableOpacity
              style={[styles.quickRejectBtn, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onReject(expense);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={14} color="#dc2626" />
            </TouchableOpacity>
          )}

          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
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
    gap: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  catIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  catText: {
    fontSize: 11,
    marginTop: 1,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  paymentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paymentTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  hasPhotoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  hasPhotoText: {
    fontSize: 11,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  thumbWrapper: {
    marginTop: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  receiptThumb: {
    width: '100%',
    height: 90,
    borderRadius: 6,
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
  amountSub: {
    fontSize: 10,
    fontWeight: '600',
  },
  amountTotal: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  quickApproveText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickRejectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
