// apps/mobile/src/design-system/primitives/BentoWidget.tsx

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { SpringPressable } from './SpringPressable';
import { TabularText } from './TabularText';
import { StatusPulseDot, PulseColorVariant } from './StatusPulseDot';
import { GlassGlowType } from './GlassCard';
import { ambientGlows } from '../tokens/shadows';

export interface BentoWidgetProps {
  title: string;
  value?: string | number;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  badge?: {
    label: string;
    variant?: PulseColorVariant;
    pulse?: boolean;
  };
  glow?: GlassGlowType;
  progress?: number; // 0 - 100
  onPress?: () => void;
  colSpan?: 1 | 2 | 3;
  children?: React.ReactNode;
  style?: ViewStyle;
}

export const BentoWidget: React.FC<BentoWidgetProps> = ({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  iconBg,
  badge,
  glow = 'none',
  progress,
  onPress,
  colSpan = 1,
  children,
  style,
}) => {
  const { theme } = useTheme();

  const glowStyle: ViewStyle =
    glow === 'primary'
      ? ambientGlows.primary
      : glow === 'emerald'
      ? ambientGlows.emerald
      : glow === 'amber'
      ? ambientGlows.amber
      : glow === 'crimson'
      ? ambientGlows.crimson
      : {};

  const widgetContent = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.glassBorder,
        },
        glowStyle,
        style,
      ]}
    >
      {/* Top Header Row */}
      <View style={styles.topRow}>
        {icon && (
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: iconBg || theme.colors.primaryMuted,
              },
            ]}
          >
            <Ionicons name={icon} size={20} color={iconColor || theme.colors.primary} />
          </View>
        )}

        {badge && (
          <View
            style={[
              styles.badgePill,
              {
                backgroundColor: theme.colors.surface0,
                borderColor: theme.colors.glassBorder,
              },
            ]}
          >
            {badge.pulse !== false && (
              <StatusPulseDot
                variant={badge.variant || 'emerald'}
                size={6}
                style={styles.pulseDotMargin}
              />
            )}
            <Text style={[styles.badgeText, { color: theme.colors.textSecondary }]}>
              {badge.label}
            </Text>
          </View>
        )}
      </View>

      {/* Main Metric Value */}
      {value !== undefined && (
        <View style={styles.metricContainer}>
          <TabularText style={[styles.metricValue, { color: theme.colors.textPrimary }]}>
            {value}
          </TabularText>
          <Text style={[styles.metricTitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}

      {/* Optional Progress Indicator */}
      {typeof progress === 'number' && (
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.surface2 }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, Math.max(0, progress))}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.progressLabelRow}>
            <Text style={[styles.progressText, { color: theme.colors.textMuted }]}>
              Hedef Gerçekleşme
            </Text>
            <TabularText style={[styles.progressVal, { color: theme.colors.primary }]}>
              %{progress}
            </TabularText>
          </View>
        </View>
      )}

      {/* Subtitle */}
      {subtitle && (
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      )}

      {children}
    </View>
  );

  if (onPress) {
    return (
      <SpringPressable onPress={onPress} style={{ width: '100%' }}>
        {widgetContent}
      </SpringPressable>
    );
  }

  return widgetContent;
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  pulseDotMargin: {
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  metricContainer: {
    marginVertical: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 3,
  },
  progressWrap: {
    marginTop: 8,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressText: {
    fontSize: 10,
  },
  progressVal: {
    fontSize: 10,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
});
