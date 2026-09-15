import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/redux';
import {
  selectShopFloorTimer,
  selectFormattedElapsedTime,
  tickTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
} from '../../store/redux/shopFloorTimerSlice';

export interface ShopFloorTimerBarProps {
  onFinishAndReport: (workOrderId: string, elapsedSeconds: number) => void;
}

export const ShopFloorTimerBar: React.FC<ShopFloorTimerBarProps> = ({
  onFinishAndReport,
}) => {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();

  const timer = useAppSelector(selectShopFloorTimer);
  const formattedTime = useAppSelector(selectFormattedElapsedTime);

  // Interval ticker
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timer.isRunning && !timer.isPaused) {
      interval = setInterval(() => {
        dispatch(tickTimer());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer.isRunning, timer.isPaused, dispatch]);

  if (!timer.isRunning) return null;

  const handleTogglePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (timer.isPaused) {
      dispatch(resumeTimer());
    } else {
      dispatch(pauseTimer());
    }
  };

  const handleFinish = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const woId = timer.activeWorkOrderId;
    const elapsed = timer.elapsedSeconds;
    dispatch(stopTimer());
    if (woId) {
      onFinishAndReport(woId, elapsed);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderTopColor: theme.colors.borderSubtle,
          ...theme.shadows.lg,
        },
      ]}
    >
      <View style={styles.leftCol}>
        {/* Active badge */}
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.pulseIndicator,
              {
                backgroundColor: timer.isPaused ? '#f59e0b' : '#10b981',
              },
            ]}
          />
          <Text style={[styles.statusText, { color: timer.isPaused ? '#f59e0b' : '#10b981' }]}>
            {timer.isPaused ? 'DURAKLATILDI' : 'OPERASYON SÜRÜYOR'}
          </Text>
        </View>

        {/* Work order & operation info */}
        <Text style={[styles.woText, { color: theme.colors.text }]} numberOfLines={1}>
          {timer.workOrderNumber} {timer.productName ? `• ${timer.productName}` : ''}
        </Text>

        {/* Live digital time counter */}
        <Text style={[styles.counterTime, { color: theme.colors.primary }]}>
          {formattedTime}
        </Text>
      </View>

      {/* Control Buttons */}
      <View style={styles.controlsRow}>
        {/* Pause / Resume Button */}
        <TouchableOpacity
          style={[
            styles.pauseBtn,
            {
              backgroundColor: timer.isPaused ? theme.colors.primary : theme.colors.borderSubtle,
            },
          ]}
          onPress={handleTogglePause}
          activeOpacity={0.7}
        >
          <Ionicons
            name={timer.isPaused ? 'play' : 'pause'}
            size={18}
            color={timer.isPaused ? '#ffffff' : theme.colors.text}
          />
        </TouchableOpacity>

        {/* Finish & Report Button */}
        <TouchableOpacity
          style={styles.finishBtn}
          onPress={handleFinish}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-done" size={16} color="#ffffff" />
          <Text style={styles.finishBtnText}>Bitir & Bildir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    zIndex: 10,
  },
  leftCol: {
    flex: 1,
    marginRight: 10,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pulseIndicator: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  woText: {
    fontSize: 12,
    fontWeight: '700',
  },
  counterTime: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pauseBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  finishBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
