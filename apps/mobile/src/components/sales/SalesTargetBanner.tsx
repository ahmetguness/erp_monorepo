import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  SalesTargetSnapshot,
  getMonthlySalesTarget,
} from '../../services/sales.service';
import { formatCurrency } from '../../lib/utils';

interface Props {
  onRefreshTrigger?: number;
}

export const SalesTargetBanner: React.FC<Props> = ({ onRefreshTrigger }) => {
  const { theme } = useTheme();
  const [target, setTarget] = useState<SalesTargetSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const loadTarget = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getMonthlySalesTarget();
      setTarget(data);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTarget();
  }, [loadTarget, onRefreshTrigger]);

  if (!target && !isLoading) {
    return null;
  }

  const progress = Math.min(100, Math.max(0, target?.progressPercent ?? 0));
  const isGoalReached = progress >= 100;
  const isDoingWell = progress >= 60;

  const currentMonthName = new Date().toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: isGoalReached
            ? '#10b981'
            : isDoingWell
            ? theme.colors.primary
            : theme.colors.borderSubtle,
          ...theme.shadows.sm,
        },
      ]}
    >
      {/* Header Row */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setIsCollapsed((prev) => !prev);
        }}
        style={styles.headerRow}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isGoalReached
                  ? '#ecfdf5'
                  : isDoingWell
                  ? theme.colors.primaryMuted
                  : '#fffbeb',
              },
            ]}
          >
            <Ionicons
              name={isGoalReached ? 'trophy' : isDoingWell ? 'trending-up' : 'flag-outline'}
              size={18}
              color={isGoalReached ? '#10b981' : isDoingWell ? theme.colors.primary : '#f59e0b'}
            />
          </View>
          <View>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Aylık Satış Hedefi ({currentMonthName})
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {isGoalReached
                ? 'Tebrikler! Hedef aşıldı 🎉'
                : `%${progress.toFixed(1)} tamamlandı`}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: isGoalReached
                    ? '#ecfdf5'
                    : isDoingWell
                    ? '#eff6ff'
                    : '#fffbeb',
                  borderColor: isGoalReached
                    ? '#10b981'
                    : isDoingWell
                    ? '#3b82f6'
                    : '#f59e0b',
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: isGoalReached
                      ? '#059669'
                      : isDoingWell
                      ? '#2563eb'
                      : '#d97706',
                  },
                ]}
              >
                %{progress.toFixed(0)}
              </Text>
            </View>
          )}
          <Ionicons
            name={isCollapsed ? 'chevron-down' : 'chevron-up'}
            size={16}
            color={theme.colors.textMuted}
            style={{ marginLeft: 6 }}
          />
        </View>
      </TouchableOpacity>

      {/* Progress Bar (Always visible) */}
      <View
        style={[
          styles.progressTrack,
          { backgroundColor: theme.colors.borderSubtle },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress}%`,
              backgroundColor: isGoalReached
                ? '#10b981'
                : isDoingWell
                ? theme.colors.primary
                : '#f59e0b',
            },
          ]}
        />
      </View>

      {/* Detailed stats (Collapsible) */}
      {!isCollapsed && target && (
        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Gerçekleşen Ciro
            </Text>
            <Text
              style={[
                styles.statVal,
                { color: isGoalReached ? '#10b981' : theme.colors.text },
              ]}
            >
              {formatCurrency(target.actualAmount)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

          <View style={styles.statCol}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Hedeflenen
            </Text>
            <Text style={[styles.statVal, { color: theme.colors.textSecondary }]}>
              {formatCurrency(target.targetAmount)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

          <View style={styles.statCol}>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
              Kalan Tutar
            </Text>
            <Text
              style={[
                styles.statVal,
                { color: target.remainingAmount <= 0 ? '#10b981' : '#f59e0b' },
              ]}
            >
              {target.remainingAmount <= 0 ? 'Tamamlandı' : formatCurrency(target.remainingAmount)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 2,
  },
  statVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 24,
  },
});
