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
import { WorkOrder, WorkOrderStatus } from '../../services/production.service';
import { Badge } from '../common/Badge';
import { formatDate } from '../../lib/utils';

export interface WorkOrderCardProps {
  workOrder: WorkOrder;
  isTimerRunningForThis?: boolean;
  onPress?: (wo: WorkOrder) => void;
  onStartTimer: (wo: WorkOrder) => void;
  onReportOutput: (wo: WorkOrder) => void;
  onChangeStatus?: (wo: WorkOrder) => void;
}

export const WorkOrderCard: React.FC<WorkOrderCardProps> = ({
  workOrder,
  isTimerRunningForThis = false,
  onPress,
  onStartTimer,
  onReportOutput,
  onChangeStatus,
}) => {
  const { theme } = useTheme();

  const getStatusInfo = (status: WorkOrderStatus) => {
    switch (status) {
      case 'PLANNED':
        return { label: 'PLANLANDI', variant: 'neutral' as const };
      case 'IN_PROGRESS':
        return { label: 'ÜRETİMDE', variant: 'info' as const };
      case 'PAUSED':
        return { label: 'DURAKLATILDI', variant: 'warning' as const };
      case 'COMPLETED':
        return { label: 'TAMAMLANDI', variant: 'success' as const };
      case 'CANCELLED':
        return { label: 'İPTAL', variant: 'danger' as const };
      default:
        return { label: status, variant: 'neutral' as const };
    }
  };

  const statusInfo = getStatusInfo(workOrder.status);

  const planned = Number(workOrder.plannedQty) || 1;
  const produced = Number(workOrder.producedQty) || 0;
  const progressPct = Math.min(100, Math.round((produced / planned) * 100));

  const operations = workOrder.operations || [];

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: isTimerRunningForThis ? theme.colors.primary : theme.colors.borderSubtle,
          borderWidth: isTimerRunningForThis ? 1.5 : 1,
          borderRadius: theme.borderRadius.lg,
          ...theme.shadows.sm,
        },
      ]}
      activeOpacity={0.8}
      onPress={() => onPress?.(workOrder)}
    >
      {/* Top Header */}
      <View style={styles.topRow}>
        <View style={styles.woNumberBadge}>
          <Text style={[styles.woNumberText, { color: theme.colors.primary }]}>
            {workOrder.number}
          </Text>
        </View>

        <Badge label={statusInfo.label} variant={statusInfo.variant} size="sm" />
      </View>

      {/* Product Title and Code */}
      <View style={styles.productBlock}>
        <Text style={[styles.productName, { color: theme.colors.text }]} numberOfLines={1}>
          {workOrder.product?.name || 'Ürün Belirtilmedi'}
        </Text>
        <Text style={[styles.productSku, { color: theme.colors.textMuted }]}>
          SKU: {workOrder.product?.code || '-'}
          {workOrder.bom ? ` • Reçete: ${workOrder.bom.name} (v${workOrder.bom.version})` : ''}
        </Text>
      </View>

      {/* Quantity & Progress Section */}
      <View
        style={[
          styles.progressBox,
          {
            backgroundColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.md,
          },
        ]}
      >
        <View style={styles.qtyRow}>
          <View>
            <Text style={[styles.qtySub, { color: theme.colors.textMuted }]}>ÜRETİLEN / PLANLANAN</Text>
            <Text style={[styles.qtyMain, { color: theme.colors.text }]}>
              {produced} / {planned} <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>ADET</Text>
            </Text>
          </View>

          <Text style={[styles.progressPctText, { color: theme.colors.primary }]}>
            %{progressPct}
          </Text>
        </View>

        <View style={[styles.track, { backgroundColor: theme.colors.surfaceCard }]}>
          <View
            style={[
              styles.fill,
              {
                width: `${progressPct}%`,
                backgroundColor:
                  progressPct >= 100
                    ? theme.colors.success
                    : progressPct > 0
                    ? theme.colors.primary
                    : theme.colors.textMuted,
              },
            ]}
          />
        </View>
      </View>

      {/* Operations Preview if available */}
      {operations.length > 0 && (
        <View style={styles.operationsList}>
          <Text style={[styles.operationsLabel, { color: theme.colors.textMuted }]}>
            Operasyon Adımları ({operations.length}):
          </Text>
          <View style={styles.operationsRow}>
            {operations.map((op) => (
              <View
                key={op.id}
                style={[
                  styles.opChip,
                  {
                    backgroundColor:
                      op.status === 'COMPLETED'
                        ? '#ecfdf5'
                        : op.status === 'IN_PROGRESS'
                        ? '#eff6ff'
                        : theme.colors.borderSubtle,
                    borderColor:
                      op.status === 'COMPLETED'
                        ? '#a7f3d0'
                        : op.status === 'IN_PROGRESS'
                        ? '#bfdbfe'
                        : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.opChipText,
                    {
                      color:
                        op.status === 'COMPLETED'
                          ? '#047857'
                          : op.status === 'IN_PROGRESS'
                          ? '#1d4ed8'
                          : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {op.stepOrder}. {op.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Dates and Meta Footer */}
      <View style={styles.datesRow}>
        <Text style={[styles.dateText, { color: theme.colors.textMuted }]}>
          Başlangıç: {workOrder.startDate ? formatDate(workOrder.startDate) : '-'}
        </Text>
        {Boolean(workOrder.scrapQty && workOrder.scrapQty > 0) && (
          <Text style={[styles.scrapWarning, { color: theme.colors.danger }]}>
            Fire: {workOrder.scrapQty} Adet
          </Text>
        )}
      </View>

      {/* Footer Action Buttons */}
      <View style={styles.footerRow}>
        {/* Timer Start Button */}
        <TouchableOpacity
          style={[
            styles.timerBtn,
            {
              backgroundColor: isTimerRunningForThis ? '#ef4444' : theme.colors.primary,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onStartTimer(workOrder);
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isTimerRunningForThis ? 'stop-circle' : 'stopwatch'}
            size={16}
            color="#ffffff"
          />
          <Text style={styles.timerBtnText}>
            {isTimerRunningForThis ? 'Sayacı Durdur' : 'Kronometre'}
          </Text>
        </TouchableOpacity>

        {/* Report Output Button */}
        <TouchableOpacity
          style={[
            styles.reportBtn,
            {
              backgroundColor: theme.colors.borderSubtle,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onReportOutput(workOrder);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="checkmark-done-circle-outline" size={16} color={theme.colors.text} />
          <Text style={[styles.reportBtnText, { color: theme.colors.text }]}>Üretim Bildir</Text>
        </TouchableOpacity>

        {/* Status Change Shortcut */}
        {onChangeStatus && (
          <TouchableOpacity
            style={[styles.statusBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onChangeStatus(workOrder);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.text} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  woNumberBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  woNumberText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  productBlock: {
    gap: 2,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  productSku: {
    fontSize: 11,
  },
  progressBox: {
    padding: 10,
    gap: 6,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  qtySub: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  qtyMain: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
  },
  progressPctText: {
    fontSize: 14,
    fontWeight: '800',
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  operationsList: {
    gap: 4,
  },
  operationsLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  operationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  opChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  opChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 11,
  },
  scrapWarning: {
    fontSize: 11,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  timerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  timerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  reportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  reportBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
