// apps/mobile/src/design-system/primitives/GlassCard.tsx

import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { SpringPressable } from './SpringPressable';
import { ambientGlows } from '../tokens/shadows';

export type GlassGlowType = 'primary' | 'emerald' | 'amber' | 'crimson' | 'none';

export interface GlassCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  glow?: GlassGlowType;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
  disabled?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  onPress,
  glow = 'none',
  selected = false,
  style,
  padding = 16,
  borderRadius = 16,
  disabled = false,
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

  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.glassBg,
    borderColor: selected ? theme.colors.glassBorderActive : theme.colors.glassBorder,
    borderWidth: 1,
    borderRadius,
    padding,
    ...glowStyle,
  };

  if (onPress && !disabled) {
    return (
      <SpringPressable
        onPress={onPress}
        style={[cardStyle, style]}
      >
        {children}
      </SpringPressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
};
