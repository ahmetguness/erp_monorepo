import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
export type BadgeStyle = 'subtle' | 'solid';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  badgeStyle?: BadgeStyle;
  size?: BadgeSize;
  dot?: boolean;
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  badgeStyle = 'subtle',
  size = 'md',
  dot = false,
  style,
}) => {
  const { theme } = useTheme();

  const getColors = (): { bg: string; text: string; dot: string } => {
    if (badgeStyle === 'solid') {
      switch (variant) {
        case 'success':
          return { bg: theme.colors.success, text: theme.colors.white, dot: theme.colors.white };
        case 'warning':
          return { bg: theme.colors.warning, text: theme.colors.white, dot: theme.colors.white };
        case 'danger':
          return { bg: theme.colors.danger, text: theme.colors.white, dot: theme.colors.white };
        case 'info':
          return { bg: theme.colors.info, text: theme.colors.white, dot: theme.colors.white };
        case 'primary':
          return { bg: theme.colors.primary, text: theme.colors.white, dot: theme.colors.white };
        case 'neutral':
        default:
          return { bg: theme.colors.textMuted, text: theme.colors.white, dot: theme.colors.white };
      }
    } else {
      switch (variant) {
        case 'success':
          return { bg: theme.colors.successMuted, text: theme.colors.success, dot: theme.colors.success };
        case 'warning':
          return { bg: theme.colors.warningMuted, text: theme.colors.warning, dot: theme.colors.warning };
        case 'danger':
          return { bg: theme.colors.dangerMuted, text: theme.colors.danger, dot: theme.colors.danger };
        case 'info':
          return { bg: theme.colors.infoMuted, text: theme.colors.info, dot: theme.colors.info };
        case 'primary':
          return { bg: theme.colors.primaryMuted, text: theme.colors.primary, dot: theme.colors.primary };
        case 'neutral':
        default:
          return { bg: theme.colors.surface, text: theme.colors.textSecondary, dot: theme.colors.textSecondary };
      }
    }
  };

  const colors = getColors();

  const isSmall = size === 'sm';
  const containerStyle: ViewStyle = {
    backgroundColor: colors.bg,
    paddingVertical: isSmall ? 2 : 4,
    paddingHorizontal: isSmall ? 6 : 10,
    borderRadius: theme.borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  };

  const textStyle: TextStyle = {
    color: colors.text,
    fontSize: isSmall ? theme.typography.sizes.xs : theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  };

  return (
    <View style={[containerStyle, style]}>
      {dot && (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: colors.dot,
              width: isSmall ? 5 : 6,
              height: isSmall ? 5 : 6,
              borderRadius: 3,
              marginRight: 5,
            },
          ]}
        />
      )}
      <Text style={textStyle}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  dot: {
    // defined inline
  },
});
