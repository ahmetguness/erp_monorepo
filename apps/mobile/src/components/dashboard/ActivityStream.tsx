import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { MobileDashboardActivity } from '../../services/dashboard.service';
import { Badge, BadgeVariant } from '../common/Badge';

export interface ActivityStreamProps {
  activities: MobileDashboardActivity[];
  onActivityPress?: (activity: MobileDashboardActivity) => void;
  onViewAllPress?: () => void;
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} sa önce`;
    if (diffDays === 1) return 'Dün';
    if (diffDays < 7) return `${diffDays} gün önce`;

    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function getActivityIcon(type: MobileDashboardActivity['type']): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  switch (type) {
    case 'INVOICE':
      return { icon: 'receipt-outline', color: '#2563eb', bg: '#eff6ff' };
    case 'ORDER':
      return { icon: 'cart-outline', color: '#10b981', bg: '#ecfdf5' };
    case 'APPROVAL':
      return { icon: 'shield-checkmark-outline', color: '#f59e0b', bg: '#fffbeb' };
    case 'PAYMENT':
      return { icon: 'wallet-outline', color: '#8b5cf6', bg: '#f5f3ff' };
    case 'STOCK':
      return { icon: 'cube-outline', color: '#0ea5e9', bg: '#f0f9ff' };
    default:
      return { icon: 'notifications-outline', color: '#64748b', bg: '#f8fafc' };
  }
}

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PAID':
    case 'APPROVED':
    case 'COMPLETED':
      return { label: 'Tamamlandı', variant: 'success' };
    case 'PENDING':
    case 'DRAFT':
      return { label: 'Bekliyor', variant: 'warning' };
    case 'SENT':
    case 'PROCESSING':
      return { label: 'İşlemde', variant: 'info' };
    case 'OVERDUE':
    case 'REJECTED':
    case 'CANCELLED':
    case 'FAILED':
      return { label: 'Gecikmiş/İptal', variant: 'danger' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

export const ActivityStream: React.FC<ActivityStreamProps> = ({
  activities,
  onActivityPress,
  onViewAllPress,
}) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithDot}>
          <View style={[styles.liveDot, { backgroundColor: theme.colors.success }]} />
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Canlı Hareketler
          </Text>
        </View>

        {onViewAllPress && activities.length > 0 && (
          <TouchableOpacity onPress={onViewAllPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.viewAllText, { color: theme.colors.primary }]}>
              Tümü
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Card Body */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.lg,
            ...theme.shadows.sm,
          },
        ]}
      >
        {activities.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="file-tray-outline" size={32} color={theme.colors.textMuted} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              Henüz son aktivite kaydı yok
            </Text>
          </View>
        ) : (
          activities.map((item, index) => {
            const iconInfo = getActivityIcon(item.type);
            const statusInfo = getStatusBadge(item.status);
            const isLast = index === activities.length - 1;

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                disabled={!onActivityPress}
                onPress={() => {
                  if (onActivityPress) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    onActivityPress(item);
                  }
                }}
                style={[
                  styles.activityItem,
                  !isLast && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.borderSubtle,
                  },
                ]}
              >
                {/* Icon box */}
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: iconInfo.bg,
                      borderRadius: theme.borderRadius.md,
                    },
                  ]}
                >
                  <Ionicons name={iconInfo.icon} size={18} color={iconInfo.color} />
                </View>

                {/* Content */}
                <View style={styles.itemContent}>
                  <View style={styles.itemTopRow}>
                    <Text
                      style={[
                        styles.itemTitle,
                        { color: theme.colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        styles.timeText,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      {formatRelativeTime(item.timestamp)}
                    </Text>
                  </View>

                  <View style={styles.itemBottomRow}>
                    <Text
                      style={[
                        styles.itemSubtitle,
                        { color: theme.colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {item.subtitle}
                    </Text>
                    <Badge
                      label={statusInfo.label}
                      variant={statusInfo.variant}
                      size="sm"
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  titleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemSubtitle: {
    fontSize: 12,
    flex: 1,
  },
  emptyState: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
