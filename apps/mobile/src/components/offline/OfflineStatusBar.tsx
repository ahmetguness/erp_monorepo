import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store/redux';
import {
  selectIsOnline,
  selectPendingMutationsCount,
  selectConflictMutationsCount,
  selectIsSyncingQueue,
} from '../../store/redux';

interface OfflineStatusBarProps {
  onPressQueue?: () => void;
  onPressConflict?: () => void;
}

export const OfflineStatusBar: React.FC<OfflineStatusBarProps> = ({
  onPressQueue,
  onPressConflict,
}) => {
  const isOnline = useAppSelector(selectIsOnline);
  const pendingCount = useAppSelector(selectPendingMutationsCount);
  const conflictCount = useAppSelector(selectConflictMutationsCount);
  const isSyncing = useAppSelector(selectIsSyncingQueue);

  const insets = useSafeAreaInsets();
  const containerPaddingTop = Math.max(insets.top, Platform.OS === 'ios' ? 14 : 8);

  const [showSuccessBadge, setShowSuccessBadge] = useState(false);
  const [prevSyncing, setPrevSyncing] = useState(false);

  // When syncing finishes and pendingCount is 0, show brief success badge
  useEffect(() => {
    if (prevSyncing && !isSyncing && pendingCount === 0 && isOnline) {
      setShowSuccessBadge(true);
      const timer = setTimeout(() => setShowSuccessBadge(false), 3500);
      return () => clearTimeout(timer);
    }
    setPrevSyncing(isSyncing);
  }, [isSyncing, pendingCount, isOnline, prevSyncing]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (conflictCount > 0 && onPressConflict) {
      onPressConflict();
    } else if (onPressQueue) {
      onPressQueue();
    }
  };

  // If online, no pending items, no conflicts, and not syncing, hide bar
  if (isOnline && pendingCount === 0 && conflictCount === 0 && !isSyncing && !showSuccessBadge) {
    return null;
  }

  // 1. Conflict Warning State (Highest Priority)
  if (conflictCount > 0) {
    return (
      <TouchableOpacity
        style={[styles.container, { paddingTop: containerPaddingTop }, styles.conflictBg]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.contentRow}>
          <Ionicons name="alert-circle" size={16} color="#FFFFFF" />
          <Text style={styles.text} numberOfLines={1}>
            {conflictCount} işlem çakışma nedeniyle bekliyor — Çözmek için dokunun
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
      </TouchableOpacity>
    );
  }

  // 2. Active Syncing State
  if (isSyncing) {
    return (
      <TouchableOpacity
        style={[styles.container, { paddingTop: containerPaddingTop }, styles.syncingBg]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.contentRow}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.text} numberOfLines={1}>
            Çevrimdışı veriler sunucuya aktarılıyor ({pendingCount} işlem)...
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
      </TouchableOpacity>
    );
  }

  // 3. Sync Success State
  if (showSuccessBadge) {
    return (
      <View style={[styles.container, { paddingTop: containerPaddingTop }, styles.successBg]}>
        <View style={styles.contentRow}>
          <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
          <Text style={styles.text} numberOfLines={1}>
            Tüm çevrimdışı işlemler başarıyla eşitlendi
          </Text>
        </View>
      </View>
    );
  }

  // 4. Offline State (10.3: Sarı 'Çevrimdışı Mod' uyarısı)
  if (!isOnline) {
    return (
      <TouchableOpacity
        style={[styles.container, { paddingTop: containerPaddingTop }, styles.offlineBg]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.contentRow}>
          <Ionicons name="cloud-offline" size={16} color="#78350F" />
          <Text style={[styles.text, styles.offlineText]} numberOfLines={1}>
            Çevrimdışı Mod {pendingCount > 0 ? `• ${pendingCount} işlem yerel kuyrukta` : '• Yerel önbellek devrede'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color="#78350F" />
      </TouchableOpacity>
    );
  }

  // 5. Online with pending queue
  return (
    <TouchableOpacity
      style={[styles.container, { paddingTop: containerPaddingTop }, styles.pendingBg]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <View style={styles.contentRow}>
        <Ionicons name="hourglass-outline" size={16} color="#FFFFFF" />
        <Text style={styles.text} numberOfLines={1}>
          {pendingCount} işlem senkronizasyon bekliyor
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 14,
    zIndex: 999,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  offlineBg: {
    backgroundColor: '#FDE047', // Warm yellow
  },
  offlineText: {
    color: '#713F12', // Dark amber/brown for contrast
    fontWeight: '700',
  },
  syncingBg: {
    backgroundColor: '#0284C7', // Enterprise sky blue
  },
  successBg: {
    backgroundColor: '#10B981', // Emerald green
  },
  conflictBg: {
    backgroundColor: '#EF4444', // Red warning
  },
  pendingBg: {
    backgroundColor: '#6366F1', // Indigo
  },
});
