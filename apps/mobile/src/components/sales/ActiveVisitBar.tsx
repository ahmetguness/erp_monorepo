import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { FieldVisitData } from '../../services/sales.service';

interface Props {
  activeVisit: FieldVisitData;
  onFinishPress: () => void;
}

export const ActiveVisitBar: React.FC<Props> = ({ activeVisit, onFinishPress }) => {
  const { theme } = useTheme();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startMs = new Date(activeVisit.startTime).getTime();

    const updateTimer = () => {
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      setElapsedSeconds(diffSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeVisit.startTime]);

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: '#0f172a',
          borderColor: '#22c55e',
          ...theme.shadows.md,
        },
      ]}
    >
      {/* Pulse dot + Customer */}
      <View style={styles.leftCol}>
        <View style={styles.pulseDot} />
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.tagText}>SAHA ZİYARETİ AKTİF</Text>
            <Text style={styles.timerText}>{timeFormatted}</Text>
          </View>
          <Text style={styles.customerName} numberOfLines={1}>
            {activeVisit.contactName}
          </Text>
        </View>
      </View>

      {/* Finish Button */}
      <TouchableOpacity
        style={styles.finishBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onFinishPress();
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="checkmark-done" size={15} color="#ffffff" />
        <Text style={styles.finishBtnText}>Bitir</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 99,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagText: {
    color: '#4ade80',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  customerName: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  finishBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
