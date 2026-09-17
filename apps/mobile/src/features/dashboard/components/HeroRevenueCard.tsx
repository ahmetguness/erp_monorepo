// apps/mobile/src/features/dashboard/components/HeroRevenueCard.tsx

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme';
import { GlassCard } from '../../../design-system/primitives/GlassCard';
import { AnimatedCounter } from '../../../design-system/primitives/AnimatedCounter';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { StatusPulseDot } from '../../../design-system/primitives/StatusPulseDot';

export interface HeroRevenueCardProps {
  todayGross: number;
  todayCount: number;
  changePercent: number;
  changeIsPositive: boolean;
  targetProgress: number;
  onPress?: () => void;
  style?: ViewStyle;
}

export const HeroRevenueCard: React.FC<HeroRevenueCardProps> = ({
  todayGross,
  todayCount,
  changePercent,
  changeIsPositive,
  targetProgress,
  onPress,
  style,
}) => {
  const { theme } = useTheme();

  return (
    <GlassCard
      glow={changeIsPositive ? 'emerald' : 'none'}
      onPress={onPress}
      style={[styles.container, style]}
    >
      {/* Top row: Label & Positive/Negative Badge */}
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <StatusPulseDot
            variant={changeIsPositive ? 'emerald' : 'amber'}
            size={7}
            style={styles.pulseDot}
          />
          <Text style={[styles.eyebrow, { color: theme.colors.textSecondary }]}>
            GÜNLÜK SATIŞ CİROSU (HERO)
          </Text>
        </View>

        <View
          style={[
            styles.changeBadge,
            {
              backgroundColor: changeIsPositive ? theme.colors.successMuted : theme.colors.dangerMuted,
              borderColor: changeIsPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            },
          ]}
        >
          <Ionicons
            name={changeIsPositive ? 'trending-up' : 'trending-down'}
            size={13}
            color={changeIsPositive ? theme.colors.emeraldNeon : theme.colors.crimsonLaser}
          />
          <Text
            style={[
              styles.changeBadgeText,
              { color: changeIsPositive ? theme.colors.emeraldNeon : theme.colors.crimsonLaser },
            ]}
          >
            {changeIsPositive ? '+' : ''}
            {changePercent}% dünden
          </Text>
        </View>
      </View>

      {/* Main Kinetic Counter Value */}
      <View style={styles.valueRow}>
        <AnimatedCounter
          value={todayGross}
          duration={850}
          formatter={(v) =>
            new Intl.NumberFormat('tr-TR', {
              style: 'currency',
              currency: 'TRY',
              maximumFractionDigits: 0,
            }).format(v)
          }
          style={[styles.revenueAmount, { color: theme.colors.textPrimary }]}
        />
      </View>

      {/* Subtitle / Invoices Count */}
      <Text style={[styles.invoiceSubtitle, { color: theme.colors.textMuted }]}>
        {todayCount} Adet Satış Faturası Kesildi
      </Text>

      {/* Sales Target Progress Bar */}
      <View style={styles.progressSection}>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.surface2 }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, Math.max(0, targetProgress))}%`,
                backgroundColor: theme.colors.primary,
              },
            ]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.targetLabel, { color: theme.colors.textMuted }]}>
            Günlük Hedef Gerçekleşme Oranı
          </Text>
          <TabularText style={[styles.targetPercent, { color: theme.colors.primary }]}>
            %{Math.round(targetProgress)}
          </TabularText>
        </View>
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderRadius: 22,
    marginVertical: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseDot: {
    marginRight: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  changeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  valueRow: {
    marginVertical: 4,
  },
  revenueAmount: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  invoiceSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 14,
  },
  progressSection: {
    marginTop: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  targetPercent: {
    fontSize: 12,
    fontWeight: '800',
  },
});
