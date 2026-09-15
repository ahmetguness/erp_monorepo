import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';

export interface BatchActionBarProps {
  selectedCount: number;
  isActing?: boolean;
  onApproveAll: () => void;
  onCancel: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  isActing = false,
  onApproveAll,
  onCancel,
}) => {
  const { theme } = useTheme();

  if (selectedCount === 0) return null;

  const handleApprove = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onApproveAll();
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onCancel();
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.borderSubtle,
          borderRadius: theme.borderRadius.xl,
          ...theme.shadows.lg,
        },
      ]}
    >
      <View style={styles.leftInfo}>
        <View
          style={[
            styles.countBadge,
            { backgroundColor: theme.colors.primaryMuted },
          ]}
        >
          <Text style={[styles.countText, { color: theme.colors.primary }]}>
            {selectedCount}
          </Text>
        </View>
        <Text style={[styles.label, { color: theme.colors.text }]}>
          Talep Seçildi
        </Text>
      </View>

      <View style={styles.rightActions}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleCancel}
          disabled={isActing}
          style={[
            styles.cancelBtn,
            { backgroundColor: theme.colors.borderSubtle, borderRadius: theme.borderRadius.md },
          ]}
        >
          <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>
            Vazgeç
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleApprove}
          disabled={isActing}
          style={[
            styles.approveBtn,
            {
              backgroundColor: theme.colors.success,
              borderRadius: theme.borderRadius.md,
            },
          ]}
        >
          {isActing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={18} color="#ffffff" />
              <Text style={styles.approveText}>Hepsini Onayla</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    zIndex: 99,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    fontSize: 13,
    fontWeight: '800',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  approveText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
