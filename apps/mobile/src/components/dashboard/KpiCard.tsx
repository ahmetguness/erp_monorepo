import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { Badge, BadgeVariant } from '../common/Badge';

export interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  badge?: {
    text: string;
    variant?: BadgeVariant;
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

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress();
    }
  };

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.borderSubtle,
          borderRadius: theme.borderRadius.lg,
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
          <Badge label={badge.text} variant={badge.variant || 'neutral'} size="sm" />
        )}
      </View>

      {/* Metric Value */}
      <View style={styles.valueWrapper}>
        <Text
          style={[
            styles.value,
            {
              color: theme.colors.text,
              fontSize: fullWidth ? theme.typography.sizes['2xl'] : theme.typography.sizes.xl,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        <Text
          style={[
            styles.title,
            {
              color: theme.colors.textSecondary,
              fontSize: theme.typography.sizes.xs,
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
              { backgroundColor: theme.colors.borderSubtle },
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
            <Text
              style={[
                styles.progressLabel,
                { color: theme.colors.primary, fontWeight: '700' },
              ]}
            >
              %{progress}
            </Text>
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
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handlePress}
        style={fullWidth ? styles.fullWidthContainer : styles.halfWidthContainer}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '100%',
    minHeight: 124,
  },
  fullWidth: {
    width: '100%',
    minHeight: 134,
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
    width: 36,
    height: 36,
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
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 6,
    fontWeight: '500',
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBarTrack: {
    height: 6,
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
