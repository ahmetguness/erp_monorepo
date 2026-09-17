// apps/mobile/src/components/common/Badge.tsx

import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme';
import { StatusPulseDot, PulseColorVariant } from '../../design-system/primitives/StatusPulseDot';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
export type BadgeStyle = 'subtle' | 'solid';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  badgeStyle?: BadgeStyle;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  badgeStyle = 'subtle',
  size = 'md',
  dot = false,
  pulse = false,
  style,
}) => {
  const { theme } = useTheme();

  const getColors = (): { bg: string; text: string; border: string; pulseVariant: PulseColorVariant } => {
    if (badgeStyle === 'solid') {
      switch (variant) {
        case 'success':
          return { bg: theme.colors.emeraldNeon, text: '#FFFFFF', border: theme.colors.emeraldNeon, pulseVariant: 'emerald' };
        case 'warning':
          return { bg: theme.colors.amberPulse, text: '#FFFFFF', border: theme.colors.amberPulse, pulseVariant: 'amber' };
        case 'danger':
          return { bg: theme.colors.crimsonLaser, text: '#FFFFFF', border: theme.colors.crimsonLaser, pulseVariant: 'crimson' };
        case 'info':
          return { bg: theme.colors.info, text: '#FFFFFF', border: theme.colors.info, pulseVariant: 'primary' };
        case 'primary':
          return { bg: theme.colors.primary, text: '#FFFFFF', border: theme.colors.primary, pulseVariant: 'primary' };
        case 'neutral':
        default:
          return { bg: theme.colors.textMuted, text: '#FFFFFF', border: theme.colors.textMuted, pulseVariant: 'primary' };
      }
    } else {
      switch (variant) {
        case 'success':
          return {
            bg: theme.colors.successMuted,
            text: theme.colors.emeraldNeon,
            border: 'rgba(16, 185, 129, 0.3)',
            pulseVariant: 'emerald',
          };
        case 'warning':
          return {
            bg: theme.colors.warningMuted,
            text: theme.colors.amberPulse,
            border: 'rgba(245, 158, 11, 0.3)',
            pulseVariant: 'amber',
          };
        case 'danger':
          return {
            bg: theme.colors.dangerMuted,
            text: theme.colors.crimsonLaser,
            border: 'rgba(239, 68, 68, 0.3)',
            pulseVariant: 'crimson',
          };
        case 'info':
          return {
            bg: theme.colors.infoMuted,
            text: theme.colors.info,
            border: 'rgba(56, 189, 248, 0.3)',
            pulseVariant: 'primary',
          };
        case 'primary':
          return {
            bg: theme.colors.primaryMuted,
            text: theme.colors.primary,
            border: 'rgba(59, 130, 246, 0.3)',
            pulseVariant: 'primary',
          };
        case 'neutral':
        default:
          return {
            bg: theme.colors.surfaceCard,
            text: theme.colors.textSecondary,
            border: theme.colors.glassBorder,
            pulseVariant: 'primary',
          };
      }
    }
  };

  const colors = getColors();
  const isSmall = size === 'sm';

  const containerStyle: ViewStyle = {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    paddingVertical: isSmall ? 2 : 4,
    paddingHorizontal: isSmall ? 8 : 12,
    borderRadius: theme.borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  };

  const textStyle: TextStyle = {
    color: colors.text,
    fontSize: isSmall ? theme.typography.sizes.xs : theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: -0.1,
  };

  return (
    <View style={[containerStyle, style]}>
      {(dot || pulse) && (
        <StatusPulseDot
          variant={colors.pulseVariant}
          size={isSmall ? 5 : 6}
          pulse={pulse}
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};
