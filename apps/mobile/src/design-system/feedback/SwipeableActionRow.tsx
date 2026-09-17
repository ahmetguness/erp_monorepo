// apps/mobile/src/design-system/feedback/SwipeableActionRow.tsx

import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  View,
  StyleSheet,
  Text,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export interface SwipeableActionRowProps {
  children: React.ReactNode;
  onApprove?: () => void;
  onReject?: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SwipeableActionRow: React.FC<SwipeableActionRowProps> = ({
  children,
  onApprove,
  onReject,
  approveLabel = 'Onayla',
  rejectLabel = 'Reddet',
  disabled = false,
  style,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (disabled) return false;
        return Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 110 && onApprove) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Animated.timing(translateX, {
            toValue: 500,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            onApprove();
            translateX.setValue(0);
          });
        } else if (gestureState.dx < -110 && onReject) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          Animated.timing(translateX, {
            toValue: -500,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            onReject();
            translateX.setValue(0);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            speed: 30,
            bounciness: 7,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.actionBackground}>
        <View style={styles.approveAction}>
          {onApprove ? (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              <Text style={styles.approveText}>{approveLabel}</Text>
            </>
          ) : null}
        </View>
        <View style={styles.rejectAction}>
          {onReject ? (
            <>
              <Text style={styles.rejectText}>{rejectLabel}</Text>
              <Ionicons name="close-circle" size={22} color="#EF4444" />
            </>
          ) : null}
        </View>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    marginVertical: 4,
  },
  actionBackground: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#0D111A',
    borderRadius: 14,
  },
  approveAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  approveText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 13,
  },
  rejectAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rejectText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
});
