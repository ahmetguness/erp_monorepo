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
import { ApprovalRequest, ApprovalModule } from '../../services/approval.service';
import { Badge, BadgeVariant } from '../common/Badge';
import { formatCurrency, formatDate } from '../../lib/utils';

export interface ApprovalCardProps {
  request: ApprovalRequest;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  isActing?: boolean;
  onPress: (request: ApprovalRequest) => void;
  onApprove: (id: string) => void;
  onReject: (request: ApprovalRequest) => void;
  onToggleSelect?: (id: string) => void;
}

function getModuleInfo(module: ApprovalModule, isDark: boolean): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  switch (module) {
    case 'PURCHASE_REQUEST':
    case 'PURCHASE_ORDER':
      return {
        label: 'Satın Alma',
        icon: 'bag-check-outline',
        color: '#2563eb',
        bg: isDark ? 'rgba(37, 99, 235, 0.20)' : '#eff6ff',
      };
    case 'SALES_ORDER':
      return {
        label: 'Satış Siparişi',
        icon: 'cart-outline',
        color: '#10b981',
        bg: isDark ? 'rgba(16, 185, 129, 0.20)' : '#ecfdf5',
      };
    case 'INVOICE':
      return {
        label: 'Fatura İskonto',
        icon: 'receipt-outline',
        color: '#8b5cf6',
        bg: isDark ? 'rgba(139, 92, 246, 0.20)' : '#f5f3ff',
      };
    case 'LEAVE_REQUEST':
      return {
        label: 'İzin Talebi',
        icon: 'calendar-outline',
        color: '#f59e0b',
        bg: isDark ? 'rgba(245, 158, 11, 0.20)' : '#fffbeb',
      };
    case 'SERVICE_REQUEST':
      return {
        label: 'Servis Talebi',
        icon: 'construct-outline',
        color: '#0ea5e9',
        bg: isDark ? 'rgba(14, 165, 233, 0.20)' : '#f0f9ff',
      };
    default:
      return {
        label: 'Genel Onay',
        icon: 'shield-checkmark-outline',
        color: '#64748b',
        bg: isDark ? 'rgba(100, 116, 139, 0.20)' : '#f8fafc',
      };
  }
}

function getStatusBadge(status: ApprovalRequest['status']): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PENDING':
      return { label: 'Bekliyor', variant: 'warning' };
    case 'APPROVED':
      return { label: 'Onaylandı', variant: 'success' };
    case 'REJECTED':
      return { label: 'Reddedildi', variant: 'danger' };
    case 'CANCELLED':
      return { label: 'İptal', variant: 'neutral' };
    case 'ESCALATED':
      return { label: 'Yükseltildi', variant: 'info' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  request,
  isSelectionMode = false,
  isSelected = false,
  isActing = false,
  onPress,
  onApprove,
  onReject,
  onToggleSelect,
}) => {
  const { theme, isDark } = useTheme();
  const moduleInfo = getModuleInfo(request.flow?.module || 'OTHER', isDark);
  const statusBadge = getStatusBadge(request.status);
  const amount = request.context?.amount;
  const department = request.context?.department;
  const isPending = request.status === 'PENDING';

  const handleCardPress = () => {
    if (isSelectionMode && isPending && onToggleSelect) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onToggleSelect(request.id);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress(request);
    }
  };

  const handleApprovePress = (e: any) => {
    e?.stopPropagation?.();
    onApprove(request.id);
  };

  const handleRejectPress = (e: any) => {
    e?.stopPropagation?.();
    onReject(request);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleCardPress}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
          borderWidth: isSelected ? 2 : 1,
          borderRadius: theme.borderRadius.lg,
          ...theme.shadows.sm,
        },
      ]}
    >
      {/* Top Header: Checkbox / Module Icon / Title / Status */}
      <View style={styles.topRow}>
        <View style={styles.headerLeft}>
          {isSelectionMode && isPending ? (
            <TouchableOpacity
              onPress={() => onToggleSelect?.(request.id)}
              style={styles.checkboxTouch}
            >
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={isSelected ? theme.colors.primary : theme.colors.textMuted}
              />
            </TouchableOpacity>
          ) : (
            <View
              style={[
                styles.moduleIcon,
                { backgroundColor: moduleInfo.bg, borderRadius: theme.borderRadius.md },
              ]}
            >
              <Ionicons name={moduleInfo.icon} size={18} color={moduleInfo.color} />
            </View>
          )}

          <View style={styles.titleInfo}>
            <Text style={[styles.flowName, { color: theme.colors.text }]} numberOfLines={1}>
              {request.flow?.name || 'Onay Talebi'}
            </Text>
            <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
              {request.requestedBy || 'Talep Sahibi'} • {formatDate(request.createdAt)}
            </Text>
          </View>
        </View>

        <Badge label={statusBadge.label} variant={statusBadge.variant} size="sm" />
      </View>

      {/* Middle: Amount & Context Badges */}
      {(amount !== null && amount !== undefined && amount > 0) || department || request.notes ? (
        <View style={styles.contextRow}>
          {amount !== null && amount !== undefined && amount > 0 && (
            <View style={[styles.amountBadge, { backgroundColor: theme.colors.borderSubtle }]}>
              <Ionicons name="pricetag-outline" size={12} color={theme.colors.primary} />
              <Text style={[styles.amountText, { color: theme.colors.text }]}>
                {formatCurrency(amount)}
              </Text>
            </View>
          )}

          {department && (
            <View style={[styles.deptBadge, { backgroundColor: theme.colors.borderSubtle }]}>
              <Text style={[styles.deptText, { color: theme.colors.textSecondary }]}>
                {department}
              </Text>
            </View>
          )}

          {request.notes && (
            <Text
              style={[styles.notesSnippet, { color: theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              "{request.notes}"
            </Text>
          )}
        </View>
      ) : null}

      {/* Footer: 1-Tap Actions if PENDING */}
      {request.status === 'PENDING' && !isSelectionMode && (
        <View style={[styles.actionRow, { borderTopColor: theme.colors.borderSubtle }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={isActing}
            onPress={handleRejectPress}
            style={[
              styles.actionBtn,
              styles.rejectBtn,
              {
                backgroundColor: theme.colors.dangerMuted,
                borderColor: theme.colors.danger,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Ionicons name="close-circle-outline" size={16} color={theme.colors.danger} />
            <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>
              Reddet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            disabled={isActing}
            onPress={handleApprovePress}
            style={[
              styles.actionBtn,
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
                <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
                <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>
                  Onayla (1-Tap)
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  checkboxTouch: {
    padding: 2,
  },
  moduleIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInfo: {
    flex: 1,
    minWidth: 0,
  },
  flowName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  amountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  amountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  deptBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deptText: {
    fontSize: 11,
    fontWeight: '600',
  },
  notesSnippet: {
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
    minWidth: 100,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  rejectBtn: {
    borderWidth: 1,
  },
  approveBtn: {},
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
