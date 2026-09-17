// apps/mobile/src/design-system/primitives/SpringPressable.tsx

import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

export interface SpringPressableProps extends PressableProps {
  scaleTo?: number;
  hapticFeedback?: Haptics.ImpactFeedbackStyle | false;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const SpringPressable: React.FC<SpringPressableProps> = ({
  scaleTo = 0.97,
  hapticFeedback = Haptics.ImpactFeedbackStyle.Light,
  style,
  containerStyle,
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled && hapticFeedback !== false) {
      Haptics.impactAsync(hapticFeedback).catch(() => {});
    }
    Animated.spring(scaleAnim, {
      toValue: scaleTo,
      useNativeDriver: true,
      speed: 45,
      bounciness: 4,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 25,
      bounciness: 6,
    }).start();
    onPressOut?.(e);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      style={containerStyle}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

