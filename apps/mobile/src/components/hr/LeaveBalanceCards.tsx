import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { LeaveBalanceSummary } from '../../services/hr.service';
import { Badge } from '../common/Badge';

export interface LeaveBalanceCardsProps {
  balance: LeaveBalanceSummary;
  onNewRequest: () => void;
}

export const LeaveBalanceCards: React.FC<LeaveBalanceCardsProps> = ({
  balance,
  onNewRequest,
}) => {
  const { theme } = useTheme();

  const annualRatio =
    balance.totalAnnual > 0
      ? Math.min(1, balance.usedAnnual / balance.totalAnnual)
      : 0;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onNewRequest();
  };

  return (
    <View style={styles.container}>
      {/* Pending Banner if any */}
      {balance.pendingCount > 0 && (
        <View
          style={[
            styles.pendingNotice,
            { backgroundColor: '#fffbeb', borderColor: '#fef3c7' },
          ]}
        >
          <Ionicons name="time-outline" size={18} color="#d97706" />
          <Text style={styles.pendingNoticeText}>
            Yönetici onayında bekleyen {balance.pendingCount} adet izin talebiniz var.
          </Text>
        </View>
      )}

      {/* Balance Cards 2-Column Grid */}
      <View style={styles.cardsRow}>
        {/* Yıllık İzin Card */}
        <View
          style={[
            styles.balanceCard,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
              ...theme.shadows.sm,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="sunny" size={18} color="#0284c7" />
            </View>
            <Badge label="YILLIK İZİN" variant="primary" size="sm" />
          </View>

          <View style={styles.daysWrap}>
            <Text style={[styles.daysLarge, { color: theme.colors.text }]}>
              {balance.remainingAnnual}
            </Text>
            <Text style={[styles.daysUnit, { color: theme.colors.textMuted }]}>
              Gün Kalan
            </Text>
          </View>

          {/* Progress Bar */}
          <View
            style={[
              styles.progressBarTrack,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.round((1 - annualRatio) * 100)}%`,
                  backgroundColor: '#0284c7',
                },
              ]}
            />
          </View>

          <Text style={[styles.cardMeta, { color: theme.colors.textMuted }]}>
            {balance.usedAnnual} gün kullanıldı / {balance.totalAnnual} gün hak
          </Text>
        </View>

        {/* Mazeret / Rapor Card */}
        <View
          style={[
            styles.balanceCard,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
              ...theme.shadows.sm,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: '#ede9fe' }]}>
              <Ionicons name="help-circle" size={18} color="#7c3aed" />
            </View>
            <Badge label="MAZERET" variant="neutral" size="sm" />
          </View>

          <View style={styles.daysWrap}>
            <Text style={[styles.daysLarge, { color: theme.colors.text }]}>
              {balance.remainingExcused}
            </Text>
            <Text style={[styles.daysUnit, { color: theme.colors.textMuted }]}>
              Gün Kalan
            </Text>
          </View>

          {/* Progress Bar */}
          <View
            style={[
              styles.progressBarTrack,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.round(
                    (balance.remainingExcused / Math.max(1, balance.totalExcused)) * 100,
                  )}%`,
                  backgroundColor: '#7c3aed',
                },
              ]}
            />
          </View>

          <Text style={[styles.cardMeta, { color: theme.colors.textMuted }]}>
            {balance.usedExcused} gün kullanıldı / {balance.totalExcused} gün hak
          </Text>
        </View>
      </View>

      {/* New Request Button */}
      <TouchableOpacity
        style={[styles.newBtn, { backgroundColor: theme.colors.primary }]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Ionicons name="add-circle" size={18} color="#ffffff" />
        <Text style={styles.newBtnText}>Yeni İzin Talebi Oluştur</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    marginBottom: 12,
  },
  pendingNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  balanceCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 8,
  },
  daysLarge: {
    fontSize: 26,
    fontWeight: '800',
  },
  daysUnit: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  cardMeta: {
    fontSize: 10,
    fontWeight: '500',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    gap: 8,
  },
  newBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
