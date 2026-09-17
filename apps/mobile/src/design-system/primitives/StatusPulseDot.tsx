// apps/mobile/src/design-system/primitives/StatusPulseDot.tsx

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export type PulseColorVariant = 'emerald' | 'amber' | 'crimson' | 'primary' | 'cyan';

export interface StatusPulseDotProps {
  variant?: PulseColorVariant;
  size?: number;
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const StatusPulseDot: React.FC<StatusPulseDotProps> = ({
  variant = 'emerald',
  size = 8,
  pulse = true,
  style,
}) => {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!pulse) return;

    const animation = Animated.loop(
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 2.2,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [pulse]);

  const getColor = () => {
    switch (variant) {
      case 'amber':
        return theme.colors.amberPulse;
      case 'crimson':
        return theme.colors.crimsonLaser;
      case 'primary':
        return theme.colors.primary;
      case 'cyan':
        return theme.colors.cyanSignal;
      case 'emerald':
      default:
        return theme.colors.emeraldNeon;
    }
  };

  const dotColor = getColor();

  return (
    <View style={[styles.wrapper, { width: size * 2.2, height: size * 2.2 }, style]}>
      {pulse && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: dotColor,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        />
      )}
      <View
        style={[
          styles.coreDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: dotColor,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
  },
  coreDot: {
    zIndex: 2,
  },
});
