import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { LeaveRequest, LEAVE_TYPE_META, LeaveStatus } from '../../services/hr.service';
import { Badge, BadgeVariant } from '../common/Badge';

export interface LeaveRequestCardProps {
  request: LeaveRequest;
  onCancel?: (id: string) => void;
  isCancelling?: boolean;
}

const STATUS_BADGE_MAP: Record<LeaveStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Onay Bekliyor', variant: 'warning' },
  APPROVED: { label: 'Onaylandı', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  CANCELLED: { label: 'İptal Edildi', variant: 'neutral' },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export const LeaveRequestCard: React.FC<LeaveRequestCardProps> = ({
  request,
  onCancel,
  isCancelling = false,
}) => {
  const { theme } = useTheme();

  const meta = LEAVE_TYPE_META[request.type] ?? {
    label: request.type,
    icon: 'calendar-outline',
    color: '#475569',
    bg: '#f1f5f9',
  };

  const statusConfig = STATUS_BADGE_MAP[request.status] ?? {
    label: request.status,
    variant: 'neutral' as BadgeVariant,
  };

  const handleCancelPress = () => {
    if (!onCancel) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      'İzin Talebini İptal Et',
      'Bu izin talebini geri çekmek istediğinizden emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: () => onCancel(request.id),
        },
      ],
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.typeInfo}>
          <View style={[styles.iconContainer, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={18} color={meta.color} />
          </View>
          <View style={styles.typeTextContainer}>
            <Text style={[styles.typeTitle, { color: theme.colors.text }]}>{meta.label}</Text>
            <Text style={[styles.dateSubtitle, { color: theme.colors.textMuted }]}>
              Talep: {formatDate(request.createdAt)}
            </Text>
          </View>
        </View>
        <Badge
          label={statusConfig.label}
          variant={statusConfig.variant}
          badgeStyle="subtle"
          size="sm"
          dot
        />
      </View>

      {/* Date Span Section */}
      <View style={[styles.dateSpanBox, { backgroundColor: theme.colors.background }]}>
        <View style={styles.dateBlock}>
          <Text style={[styles.dateLabel, { color: theme.colors.textMuted }]}>BAŞLANGIÇ</Text>
          <Text style={[styles.dateValue, { color: theme.colors.text }]}>
            {formatDate(request.startDate)}
          </Text>
        </View>

        <View style={styles.arrowContainer}>
          <Ionicons name="arrow-forward-outline" size={16} color={theme.colors.textMuted} />
          <View style={[styles.daysPill, { backgroundColor: theme.colors.primaryMuted }]}>
            <Text style={[styles.daysPillText, { color: theme.colors.primary }]}>
              {request.days} Gün
            </Text>
          </View>
        </View>

        <View style={[styles.dateBlock, styles.dateBlockRight]}>
          <Text style={[styles.dateLabel, { color: theme.colors.textMuted }]}>BİTİŞ</Text>
          <Text style={[styles.dateValue, { color: theme.colors.text }]}>
            {formatDate(request.endDate)}
          </Text>
        </View>
      </View>

      {/* Reason / Notes */}
      {Boolean(request.notes) && (
        <View style={styles.notesRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.colors.textMuted} />
          <Text style={[styles.notesText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {request.notes}
          </Text>
        </View>
      )}

      {/* Approval Details */}
      {request.status === 'APPROVED' && request.approvedAt && (
        <View style={[styles.statusNotice, { backgroundColor: '#ecfdf5' }]}>
          <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
          <Text style={[styles.statusNoticeText, { color: '#065f46' }]}>
            Onaylandı ({formatDate(request.approvedAt)})
          </Text>
        </View>
      )}

      {/* Cancel Action if Pending */}
      {request.status === 'PENDING' && onCancel && (
        <View style={styles.footerAction}>
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: theme.colors.dangerMuted }]}
            onPress={handleCancelPress}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={15} color={theme.colors.danger} />
                <Text style={[styles.cancelBtnText, { color: theme.colors.danger }]}>Talebi Geri Çek</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeTextContainer: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dateSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  dateSpanBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  dateBlock: {
    flex: 1,
  },
  dateBlockRight: {
    alignItems: 'flex-end',
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  arrowContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  daysPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  daysPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  notesText: {
    fontSize: 12,
    flex: 1,
  },
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  statusNoticeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footerAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
