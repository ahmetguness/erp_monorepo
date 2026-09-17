// apps/mobile/src/components/dashboard/KpiCard.tsx

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { Badge, BadgeVariant } from '../common/Badge';
import { SpringPressable } from '../../design-system/primitives/SpringPressable';
import { TabularText } from '../../design-system/primitives/TabularText';

export interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  badge?: {
    text: string;
    variant?: BadgeVariant;
    pulse?: boolean;
  };
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  progress?: number; // 0 - 100
  onPress?: () => void;
  fullWidth?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  badge,
  icon,
  iconColor,
  iconBg,
  progress,
  onPress,
  fullWidth = false,
}) => {
  const { theme } = useTheme();

  const cardContent = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.glassBorder,
          borderRadius: 18,
          ...theme.shadows.sm,
        },
        fullWidth ? styles.fullWidth : styles.halfWidth,
      ]}
    >
      {/* Top row: Icon & Badge */}
      <View style={styles.topRow}>
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: iconBg || theme.colors.primaryMuted,
              borderRadius: theme.borderRadius.md,
            },
          ]}
        >
          <Ionicons name={icon} size={20} color={iconColor || theme.colors.primary} />
        </View>

        {badge && (
          <Badge
            label={badge.text}
            variant={badge.variant || 'neutral'}
            size="sm"
            pulse={badge.pulse}
          />
        )}
      </View>

      {/* Metric Value */}
      <View style={styles.valueWrapper}>
        <TabularText
          style={[
            styles.value,
            {
              color: theme.colors.textPrimary,
              fontSize: fullWidth ? theme.typography.sizes['2xl'] : theme.typography.sizes.xl,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </TabularText>
        <Text
          style={[
            styles.title,
            {
              color: theme.colors.textSecondary,
              fontSize: 11,
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      {/* Optional Progress Bar */}
      {typeof progress === 'number' && (
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressBarTrack,
              { backgroundColor: theme.colors.surface2 },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(100, Math.max(0, progress))}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.progressLabelRow}>
            <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>
              Hedef Gerçekleşme
            </Text>
            <TabularText
              style={[
                styles.progressLabel,
                { color: theme.colors.primary, fontWeight: '700' },
              ]}
            >
              %{progress}
            </TabularText>
          </View>
        </View>
      )}

      {/* Subtitle */}
      {subtitle && (
        <Text
          style={[
            styles.subtitle,
            {
              color: theme.colors.textMuted,
              fontSize: theme.typography.sizes.xs,
            },
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <SpringPressable
        onPress={onPress}
        style={fullWidth ? styles.fullWidthContainer : styles.halfWidthContainer}
      >
        {cardContent}
      </SpringPressable>
    );
  }

  return (
    <View style={fullWidth ? styles.fullWidthContainer : styles.halfWidthContainer}>
      {cardContent}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '100%',
    minHeight: 128,
  },
  fullWidth: {
    width: '100%',
    minHeight: 138,
  },
  halfWidthContainer: {
    width: '48%',
    flexGrow: 1,
  },
  fullWidthContainer: {
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconWrapper: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrapper: {
    marginTop: 2,
  },
  value: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  title: {
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: {
    marginTop: 6,
    fontWeight: '500',
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBarTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  progressLabel: {
    fontSize: 10,
  },
});
