import React, { useEffect, useState } from 'react';
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
  selectFormattedDowntime,
  tickTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  endDowntime,
} from '../../store/redux/shopFloorTimerSlice';
import { DowntimeReasonModal } from './DowntimeReasonModal';

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
  const formattedDowntime = useAppSelector(selectFormattedDowntime);

  const [downtimeModalVisible, setDowntimeModalVisible] = useState(false);

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

  const handleEndDowntime = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    dispatch(endDowntime());
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
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: timer.isDowntime ? '#ef444415' : theme.colors.surfaceCard,
            borderTopColor: timer.isDowntime ? '#ef4444' : theme.colors.borderSubtle,
            borderTopWidth: timer.isDowntime ? 2 : 1,
            ...theme.shadows.lg,
          },
        ]}
      >
        <View style={styles.leftCol}>
          {/* Active / Downtime badge */}
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.pulseIndicator,
                {
                  backgroundColor: timer.isDowntime
                    ? '#ef4444'
                    : timer.isPaused
                    ? '#f59e0b'
                    : '#10b981',
                },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color: timer.isDowntime
                    ? '#ef4444'
                    : timer.isPaused
                    ? '#f59e0b'
                    : '#10b981',
                  fontWeight: '700',
                },
              ]}
            >
              {timer.isDowntime
                ? `DURUŞTA: ${timer.downtimeReason || 'Mola / Arıza'}`
                : timer.isPaused
                ? 'DURAKLATILDI'
                : 'OPERASYON SÜRÜYOR'}
            </Text>
          </View>

          {/* Work order & operation info */}
          <Text style={[styles.woText, { color: theme.colors.text }]} numberOfLines={1}>
            {timer.workOrderNumber} {timer.productName ? `• ${timer.productName}` : ''}
          </Text>

          {/* Live digital time counter */}
          <View style={styles.timeRow}>
            <Text
              style={[
                styles.counterTime,
                { color: timer.isDowntime ? '#ef4444' : theme.colors.primary },
              ]}
            >
              {timer.isDowntime ? formattedDowntime : formattedTime}
            </Text>
            {timer.isDowntime && (
              <Text style={[styles.subTimeText, { color: theme.colors.textMuted }]}>
                (Ana Süre: {formattedTime})
              </Text>
            )}
          </View>
        </View>

        {/* Control Buttons */}
        <View style={styles.controlsRow}>
          {timer.isDowntime ? (
            /* Button to resume from downtime */
            <TouchableOpacity
              style={[styles.resumeDowntimeBtn, { backgroundColor: '#10b981' }]}
              onPress={handleEndDowntime}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={16} color="#ffffff" />
              <Text style={styles.btnTextWhite}>Duruşu Bitir</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Downtime Button */}
              <TouchableOpacity
                style={[styles.downtimeBtn, { backgroundColor: '#ef444418', borderColor: '#ef444440' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setDowntimeModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="pause-circle-outline" size={16} color="#ef4444" />
                <Text style={[styles.downtimeBtnText, { color: '#ef4444' }]}>Duruş</Text>
              </TouchableOpacity>

              {/* Pause / Resume Button */}
              <TouchableOpacity
                style={[
                  styles.pauseBtn,
                  {
                    backgroundColor: timer.isPaused
                      ? theme.colors.primary
                      : theme.colors.borderSubtle,
                  },
                ]}
                onPress={handleTogglePause}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={timer.isPaused ? 'play' : 'pause'}
                  size={16}
                  color={timer.isPaused ? '#ffffff' : theme.colors.text}
                />
              </TouchableOpacity>
            </>
          )}

          {/* Finish & Report Button */}
          <TouchableOpacity
            style={[styles.finishBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleFinish}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-done" size={15} color="#ffffff" />
            <Text style={styles.finishBtnText}>Bitir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Downtime Reason Selection Modal */}
      <DowntimeReasonModal
        visible={downtimeModalVisible}
        onClose={() => setDowntimeModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  leftCol: {
    flex: 1,
    marginRight: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  pulseIndicator: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  woText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  counterTime: {
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  subTimeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downtimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  downtimeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  resumeDowntimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnTextWhite: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  pauseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  finishBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
