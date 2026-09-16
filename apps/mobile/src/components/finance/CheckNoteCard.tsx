import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  CheckPromissoryNote,
  CheckStatus,
} from '../../services/finance.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge, BadgeVariant } from '../common/Badge';

interface Props {
  item: CheckPromissoryNote;
  onPress: (item: CheckPromissoryNote) => void;
  onUpdateStatus?: (item: CheckPromissoryNote, newStatus: CheckStatus) => void;
  onStatusChange?: (item: CheckPromissoryNote, newStatus: CheckStatus) => void;
}

const STATUS_CONFIG: Record<
  CheckStatus,
  { label: string; variant: BadgeVariant }
> = {
  PENDING: { label: 'Portföyde (Bekliyor)', variant: 'warning' },
  DEPOSITED: { label: 'Takasa Verildi', variant: 'info' },
  CLEARED: { label: 'Tahsil Edildi', variant: 'success' },
  BOUNCED: { label: 'Karşılıksız', variant: 'danger' },
  CANCELLED: { label: 'İptal Edildi', variant: 'neutral' },
};

export const CheckNoteCard: React.FC<Props> = ({
  item,
  onPress,
  onUpdateStatus,
  onStatusChange,
}) => {
  const updateStatusFn = onUpdateStatus || onStatusChange;
  const { theme } = useTheme();
  const cfg = STATUS_CONFIG[item.status] || { label: item.status, variant: 'neutral' as BadgeVariant };

  // Calculate days remaining until due date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isOverdue = diffDays < 0 && item.status !== 'CLEARED' && item.status !== 'CANCELLED';
  const isDueToday = diffDays === 0 && item.status !== 'CLEARED' && item.status !== 'CANCELLED';

  const isCheck = item.type === 'CHECK';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress(item);
      }}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: isOverdue ? '#ef4444' : theme.colors.borderSubtle,
          borderRadius: theme.borderRadius.lg,
          ...theme.shadows.sm,
        },
      ]}
    >
      {/* Top Row: Type & Number + Status */}
      <View style={styles.topRow}>
        <View style={styles.typeWrap}>
          <View
            style={[
              styles.typeIconBox,
              { backgroundColor: isCheck ? '#eff6ff' : '#fdf2f8' },
            ]}
          >
            <Ionicons
              name={isCheck ? 'document-text' : 'receipt'}
              size={15}
              color={isCheck ? '#2563eb' : '#db2777'}
            />
          </View>
          <Text style={[styles.numberText, { color: theme.colors.text }]}>
            {item.number}
          </Text>
          <Badge label={isCheck ? 'ÇEK' : 'SENET'} variant={isCheck ? 'info' : 'warning'} size="sm" />
        </View>

        <Badge label={cfg.label} variant={cfg.variant} size="sm" />
      </View>

      {/* Drawer / Contact & Bank Info */}
      <View style={styles.contactRow}>
        <Text style={[styles.contactName, { color: theme.colors.text }]} numberOfLines={1}>
          {item.contact?.name || 'Keşideci Bilgisi Yok'}
        </Text>
        {item.bankName && (
          <Text style={[styles.bankName, { color: theme.colors.textSecondary }]}>
            {item.bankName}
          </Text>
        )}
      </View>

      {/* Dates & Due Countdown */}
      <View style={styles.metaRow}>
        <View style={styles.dateCol}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>Vade Tarihi</Text>
          <Text
            style={[
              styles.dueDateText,
              { color: isOverdue ? '#ef4444' : theme.colors.text },
            ]}
          >
            {formatDate(item.dueDate)}
          </Text>
        </View>

        {/* Due Countdown Tag */}
        {item.status !== 'CLEARED' && item.status !== 'CANCELLED' && (
          <View
            style={[
              styles.countdownBadge,
              {
                backgroundColor: isOverdue ? '#fee2e2' : isDueToday ? '#fef3c7' : diffDays <= 7 ? '#fef9c3' : theme.colors.surface,
              },
            ]}
          >
            <Ionicons
              name={isOverdue ? 'alert-circle' : 'time-outline'}
              size={12}
              color={isOverdue ? '#b91c1c' : isDueToday ? '#b45309' : '#047857'}
            />
            <Text
              style={[
                styles.countdownText,
                { color: isOverdue ? '#b91c1c' : isDueToday ? '#b45309' : '#047857' },
              ]}
            >
              {isOverdue
                ? `${Math.abs(diffDays)} gün gecikti`
                : isDueToday
                ? 'Bugün doluyor!'
                : `${diffDays} gün kaldı`}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

      {/* Bottom Row: Amount + Quick Actions */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>Tutar</Text>
          <Text style={[styles.amountText, { color: theme.colors.text }]}>
            {formatCurrency(item.amount, item.currencyCode)}
          </Text>
        </View>

        <View style={styles.actionsWrap}>
          {item.status === 'PENDING' && updateStatusFn && (
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                updateStatusFn(item, 'DEPOSITED');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={13} color="#2563eb" />
              <Text style={[styles.quickBtnText, { color: '#2563eb' }]}>Takasa Ver</Text>
            </TouchableOpacity>
          )}

          {item.status === 'DEPOSITED' && updateStatusFn && (
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                updateStatusFn(item, 'CLEARED');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-done" size={13} color="#059669" />
              <Text style={[styles.quickBtnText, { color: '#059669' }]}>Tahsil Et</Text>
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
  },
  typeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  contactRow: {
    gap: 2,
  },
  contactName: {
    fontSize: 13,
    fontWeight: '700',
  },
  bankName: {
    fontSize: 11,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  dateCol: {
    gap: 1,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dueDateText: {
    fontSize: 13,
    fontWeight: '700',
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  countdownText: {
    fontSize: 11,
    fontWeight: '700',
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
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
