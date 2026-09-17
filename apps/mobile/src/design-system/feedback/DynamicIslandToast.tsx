// apps/mobile/src/design-system/feedback/DynamicIslandToast.tsx

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

export interface ToastProps {
  visible: boolean;
  title: string;
  message?: string;
  variant?: ToastVariant;
  duration?: number;
  onDismiss: () => void;
  actionText?: string;
  onAction?: () => void;
}

export const DynamicIslandToast: React.FC<ToastProps> = ({
  visible,
  title,
  message,
  variant = 'info',
  duration = 3500,
  onDismiss,
  actionText,
  onAction,
}) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: insets.top + 8,
          speed: 18,
          bounciness: 6,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          speed: 20,
          bounciness: 5,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      handleDismiss();
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  const getVariantIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (variant) {
      case 'success':
        return 'checkmark-circle';
      case 'warning':
        return 'warning';
      case 'error':
        return 'alert-circle';
      case 'info':
      default:
        return 'information-circle';
    }
  };

  const getVariantColor = () => {
    switch (variant) {
      case 'success':
        return theme.colors.emeraldNeon;
      case 'warning':
        return theme.colors.amberPulse;
      case 'error':
        return theme.colors.crimsonLaser;
      case 'info':
      default:
        return theme.colors.primary;
    }
  };

  const accentColor = getVariantColor();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }, { scale }],
          opacity,
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.glassBorder,
        },
      ]}
    >
      <View style={[styles.indicatorDot, { backgroundColor: accentColor }]} />
      <Ionicons name={getVariantIcon()} size={20} color={accentColor} style={styles.icon} />
      
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {message ? (
          <Text style={[styles.message, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {message}
          </Text>
        ) : null}
      </View>

      {actionText && onAction ? (
        <TouchableOpacity
          onPress={() => {
            onAction();
            handleDismiss();
          }}
          style={[styles.actionBtn, { backgroundColor: theme.colors.primaryMuted }]}
        >
          <Text style={[styles.actionText, { color: theme.colors.primary }]}>{actionText}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
          <Ionicons name="close" size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const windowWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    width: Math.min(windowWidth - 32, 420),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    zIndex: 99999,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  icon: {
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
    marginLeft: 6,
  },
});
