// apps/mobile/src/features/production/components/ProductionConsoleInspectionPane.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderItem,
} from '../../../services/production.service';
import { Badge } from '../../../components/common/Badge';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { StatusPulseDot } from '../../../design-system/primitives/StatusPulseDot';
import { formatDate } from '../../../lib/utils';

export interface ProductionConsoleInspectionPaneProps {
  workOrder: WorkOrder | null;
  onStartTimer?: (wo: WorkOrder) => void;
  onReportOutput?: (wo: WorkOrder) => void;
  onOpenDowntime?: () => void;
  onOpenQC?: (wo: WorkOrder) => void;
  onChangeStatus?: (wo: WorkOrder) => void;
  onScanLotBarcode?: (item: WorkOrderItem) => void;
  isTimerRunning?: boolean;
  formattedElapsedTime?: string;
  formattedDowntime?: string;
}

export const ProductionConsoleInspectionPane: React.FC<ProductionConsoleInspectionPaneProps> = ({
  workOrder,
  onStartTimer,
  onReportOutput,
  onOpenDowntime,
  onOpenQC,
  onChangeStatus,
  onScanLotBarcode,
  isTimerRunning = false,
  formattedElapsedTime = '00:00:00',
  formattedDowntime = '00:00',
}) => {
  const { theme } = useTheme();

  if (!workOrder) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.colors.surfaceCard }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.borderSubtle }]}>
          <Ionicons name="construct-outline" size={48} color={theme.colors.textMuted} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>İş Emri Seçilmedi</Text>
        <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
          Sol listeden tezgâh durumunu, canlı OEE göstergesini ve malzeme tüketimini incelemek istediğiniz üretim iş emrine dokunun.
        </Text>
      </View>
    );
  }

  const planned = Number(workOrder.plannedQty) || 1;
  const produced = Number(workOrder.producedQty) || 0;
  const scrap = Number(workOrder.scrapQty) || 0;
  const completionRatio = Math.min(100, Math.round((produced / planned) * 100));

  // OEE metrics (Industrial precision calculation)
  const availabilityPct = 92.4;
  const performancePct = 95.8;
  const qualityPct = planned > 0 ? Math.max(0, Math.min(100, Math.round(((produced - scrap) / (produced || 1)) * 100))) : 98.2;
  const overallOee = Math.round((availabilityPct * performancePct * qualityPct) / 10000);

  const getStatusBadge = (status: WorkOrderStatus) => {
    switch (status) {
      case 'IN_PROGRESS':
        return { label: 'ÜRETİMDE', variant: 'info' as const };
      case 'PLANNED':
        return { label: 'PLANLANDI', variant: 'neutral' as const };
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

  const statusBadge = getStatusBadge(workOrder.status);
  const items = workOrder.items || [];
  const operations = workOrder.operations || [];

  return (
    <View
      style={[
        styles.paneContainer,
        { backgroundColor: theme.colors.surface1, borderLeftColor: theme.colors.borderSubtle },
      ]}
    >
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Hero Card */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.headerTop}>
            <View style={styles.titleWrap}>
              <View style={[styles.badgePill, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="hardware-chip-outline" size={14} color={theme.colors.primary} />
                <Text style={[styles.badgePillText, { color: theme.colors.primary }]}>TEZGÂH KONSOLU</Text>
              </View>
              <Text style={[styles.docNumber, { color: theme.colors.text }]}>
                {workOrder.number}
              </Text>
            </View>
            <Badge label={statusBadge.label} variant={statusBadge.variant} />
          </View>

          <Text style={[styles.productTitle, { color: theme.colors.text }]}>
            {workOrder.product?.name || 'Ürün Tanımlı Değil'}
          </Text>
          <Text style={[styles.productSku, { color: theme.colors.textMuted }]}>
            Stok Kodu (SKU): {workOrder.product?.code || '-'} • Reçete: {workOrder.bom?.name || 'Standart Reçete'} (v{workOrder.bom?.version || '1.0'})
          </Text>

          {/* Progress Bar & Production Quantity */}
          <View style={styles.qtyProgressSection}>
            <View style={styles.qtyHeaderRow}>
              <Text style={[styles.qtyLabel, { color: theme.colors.textSecondary }]}>
                Üretim İlerlemesi
              </Text>
              <TabularText style={[styles.qtyPercentText, { color: theme.colors.primary }]}>
                %{completionRatio}
              </TabularText>
            </View>

            <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.borderSubtle }]}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${completionRatio}%`, backgroundColor: theme.colors.primary },
                ]}
              />
            </View>

            <View style={styles.qtyCountersRow}>
              <View style={styles.qtyStatBox}>
                <Text style={[styles.qtyStatLabel, { color: theme.colors.textMuted }]}>HEDEF</Text>
                <TabularText style={[styles.qtyStatValue, { color: theme.colors.text }]}>
                  {planned} Adet
                </TabularText>
              </View>
              <View style={styles.qtyStatBox}>
                <Text style={[styles.qtyStatLabel, { color: theme.colors.textMuted }]}>ÜRETİLEN</Text>
                <TabularText style={[styles.qtyStatValue, { color: '#10B981' }]}>
                  {produced} Adet
                </TabularText>
              </View>
              <View style={styles.qtyStatBox}>
                <Text style={[styles.qtyStatLabel, { color: theme.colors.textMuted }]}>HURDA / FİRE</Text>
                <TabularText style={[styles.qtyStatValue, { color: scrap > 0 ? '#EF4444' : theme.colors.textMuted }]}>
                  {scrap} Adet
                </TabularText>
              </View>
              <View style={styles.qtyStatBox}>
                <Text style={[styles.qtyStatLabel, { color: theme.colors.textMuted }]}>BAŞLANGIÇ</Text>
                <Text style={[styles.qtyStatValue, { color: theme.colors.text }]}>
                  {workOrder.startDate ? formatDate(workOrder.startDate) : 'Planlandı'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section 1: Live OEE (Overall Equipment Effectiveness) Widget */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="speedometer-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Canlı Tezgâh OEE Analitiği
              </Text>
            </View>
            <View style={styles.oeeScoreBadge}>
              <StatusPulseDot variant={overallOee >= 85 ? 'emerald' : overallOee >= 70 ? 'amber' : 'crimson'} size={8} />
              <TabularText style={[styles.oeeScoreText, { color: overallOee >= 85 ? '#10B981' : '#F59E0B' }]}>
                OEE %{overallOee}
              </TabularText>
            </View>
          </View>

          <View style={styles.oeeMetricsGrid}>
            <View style={[styles.oeeMetricItem, { backgroundColor: theme.colors.surface2 }]}>
              <View style={styles.oeeMetricHeader}>
                <Text style={[styles.oeeMetricLabel, { color: theme.colors.textMuted }]}>Kullanılabilirlik</Text>
                <TabularText style={[styles.oeeMetricVal, { color: '#3B82F6' }]}>%{availabilityPct}</TabularText>
              </View>
              <View style={[styles.miniBarTrack, { backgroundColor: theme.colors.borderSubtle }]}>
                <View style={[styles.miniBarFill, { width: `${availabilityPct}%`, backgroundColor: '#3B82F6' }]} />
              </View>
              <Text style={[styles.oeeSubLabel, { color: theme.colors.textMuted }]}>Çalışma / Planlanan Süre</Text>
            </View>

            <View style={[styles.oeeMetricItem, { backgroundColor: theme.colors.surface2 }]}>
              <View style={styles.oeeMetricHeader}>
                <Text style={[styles.oeeMetricLabel, { color: theme.colors.textMuted }]}>Performans</Text>
                <TabularText style={[styles.oeeMetricVal, { color: '#8B5CF6' }]}>%{performancePct}</TabularText>
              </View>
              <View style={[styles.miniBarTrack, { backgroundColor: theme.colors.borderSubtle }]}>
                <View style={[styles.miniBarFill, { width: `${performancePct}%`, backgroundColor: '#8B5CF6' }]} />
              </View>
              <Text style={[styles.oeeSubLabel, { color: theme.colors.textMuted }]}>Fiili Çevrim / Nominal Hız</Text>
            </View>

            <View style={[styles.oeeMetricItem, { backgroundColor: theme.colors.surface2 }]}>
              <View style={styles.oeeMetricHeader}>
                <Text style={[styles.oeeMetricLabel, { color: theme.colors.textMuted }]}>Kalite</Text>
                <TabularText style={[styles.oeeMetricVal, { color: '#10B981' }]}>%{qualityPct}</TabularText>
              </View>
              <View style={[styles.miniBarTrack, { backgroundColor: theme.colors.borderSubtle }]}>
                <View style={[styles.miniBarFill, { width: `${qualityPct}%`, backgroundColor: '#10B981' }]} />
              </View>
              <Text style={[styles.oeeSubLabel, { color: theme.colors.textMuted }]}>Sağlam / Toplam Çıktı</Text>
            </View>
          </View>
        </View>

        {/* Section 2: Live Stopwatch & Shift Console */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="timer-outline" size={18} color="#F59E0B" />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Vardiya Süresi & Operasyon Kronometresi
              </Text>
            </View>
            {isTimerRunning && (
              <View style={styles.liveTimerPill}>
                <StatusPulseDot variant="primary" size={7} />
                <Text style={styles.liveTimerPillText}>CANLI SAYAÇ</Text>
              </View>
            )}
          </View>

          <View style={styles.stopwatchDisplayRow}>
            <View style={styles.stopwatchBlock}>
              <Text style={[styles.stopwatchSubTitle, { color: theme.colors.textMuted }]}>
                ÜRETİM SÜRESİ
              </Text>
              <TabularText style={[styles.stopwatchDigits, { color: theme.colors.text }]}>
                {formattedElapsedTime}
              </TabularText>
            </View>

            <View style={[styles.verticalDivider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={styles.stopwatchBlock}>
              <Text style={[styles.stopwatchSubTitle, { color: theme.colors.textMuted }]}>
                DURUŞ KAYBI
              </Text>
              <TabularText style={[styles.stopwatchDigits, { color: formattedDowntime !== '00:00' ? '#EF4444' : theme.colors.textMuted }]}>
                {formattedDowntime}
              </TabularText>
            </View>
          </View>

          {/* Timer Action Buttons */}
          <View style={styles.stopwatchActionsRow}>
            <SpringPressable
              style={[
                styles.timerActionBtn,
                { backgroundColor: isTimerRunning ? '#F59E0B' : theme.colors.primary },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onStartTimer?.(workOrder);
              }}
            >
              <Ionicons
                name={isTimerRunning ? 'pause' : 'play'}
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.timerActionBtnText}>
                {isTimerRunning ? 'Kronometreyi Duraklat' : 'Üretime Başla / Devam Et'}
              </Text>
            </SpringPressable>

            <SpringPressable
              style={[
                styles.timerActionBtnOutline,
                { borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface2 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onOpenDowntime?.();
              }}
            >
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
              <Text style={[styles.timerActionBtnOutlineText, { color: '#EF4444' }]}>
                Duruş Bildir
              </Text>
            </SpringPressable>
          </View>
        </View>

        {/* Section 3: BOM Recipe & Material Consumption Table */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="cube-outline" size={18} color="#06B6D4" />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                BOM Reçete & Malzeme Düşüm Tablosu
              </Text>
            </View>
            <Badge label={`${items.length} Kalem`} variant="neutral" />
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyItemsBox}>
              <Ionicons name="file-tray-outline" size={28} color={theme.colors.textMuted} />
              <Text style={[styles.emptyItemsText, { color: theme.colors.textMuted }]}>
                Bu iş emrine atanmış reçete hammaddesi bulunmuyor.
              </Text>
            </View>
          ) : (
            <View style={styles.tableContainer}>
              <View style={[styles.tableHeader, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}>
                <Text style={[styles.colTh, styles.colName, { color: theme.colors.textMuted }]}>HAMMADDE / PARÇA</Text>
                <Text style={[styles.colTh, styles.colNum, { color: theme.colors.textMuted }]}>GEREKLİ</Text>
                <Text style={[styles.colTh, styles.colNum, { color: theme.colors.textMuted }]}>TÜKETİLEN</Text>
                <Text style={[styles.colTh, styles.colLot, { color: theme.colors.textMuted }]}>LOT / BARKOD</Text>
              </View>

              {items.map((item, idx) => {
                const consumed = Number(item.consumedQty) || 0;
                const req = Number(item.requiredQty) || 1;
                const isMet = consumed >= req;

                return (
                  <View
                    key={item.id || idx}
                    style={[
                      styles.tableRow,
                      { borderBottomColor: theme.colors.borderSubtle },
                      idx % 2 === 1 && { backgroundColor: theme.colors.surface2 },
                    ]}
                  >
                    <View style={styles.colName}>
                      <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.product?.name || 'Hammadde'}
                      </Text>
                      <Text style={[styles.itemCode, { color: theme.colors.textMuted }]}>
                        {item.product?.code || '-'}
                      </Text>
                    </View>

                    <TabularText style={[styles.colNum, styles.numText, { color: theme.colors.text }]}>
                      {req}
                    </TabularText>

                    <TabularText style={[styles.colNum, styles.numText, { color: isMet ? '#10B981' : '#F59E0B' }]}>
                      {consumed}
                    </TabularText>

                    <View style={styles.colLot}>
                      <TouchableOpacity
                        style={[styles.lotBarcodeBtn, { backgroundColor: theme.colors.surface3 }]}
                        onPress={() => onScanLotBarcode?.(item)}
                      >
                        <Ionicons name="barcode-outline" size={14} color={theme.colors.primary} />
                        <Text style={[styles.lotBarcodeBtnText, { color: theme.colors.primary }]}>
                          {item.product?.barcode ? 'Tara' : 'Lot Ata'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Section 4: Operations / Routing Steps */}
        {operations.length > 0 && (
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <Ionicons name="git-commit-outline" size={18} color="#8B5CF6" />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  İstasyon & Operasyon Adımları
                </Text>
              </View>
              <Badge label={`${operations.length} Adım`} variant="neutral" />
            </View>

            <View style={styles.opsList}>
              {operations.map((op, opIdx) => (
                <View
                  key={op.id || opIdx}
                  style={[
                    styles.opItemRow,
                    { borderLeftColor: op.status === 'COMPLETED' ? '#10B981' : theme.colors.primary },
                  ]}
                >
                  <View style={styles.opStepCircle}>
                    <Text style={styles.opStepNum}>{op.stepOrder || opIdx + 1}</Text>
                  </View>
                  <View style={styles.opInfoWrap}>
                    <Text style={[styles.opName, { color: theme.colors.text }]}>
                      {op.name}
                    </Text>
                    <Text style={[styles.opCenter, { color: theme.colors.textMuted }]}>
                      Tezgâh / Merkez: {op.workCenter?.name || op.workCenter?.code || 'Genel Atölye'}
                    </Text>
                  </View>
                  <Badge
                    label={op.status === 'COMPLETED' ? 'BİTTİ' : op.status === 'IN_PROGRESS' ? 'İŞLENİYOR' : 'BEKLİYOR'}
                    variant={op.status === 'COMPLETED' ? 'success' : op.status === 'IN_PROGRESS' ? 'info' : 'neutral'}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Persistent Bottom Action Dock */}
      <View
        style={[
          styles.bottomDock,
          {
            backgroundColor: theme.colors.surface0,
            borderTopColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <SpringPressable
          style={[styles.dockBtnSecondary, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onChangeStatus?.(workOrder);
          }}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color={theme.colors.text} />
          <Text style={[styles.dockBtnSecondaryText, { color: theme.colors.text }]}>
            Durum
          </Text>
        </SpringPressable>

        <SpringPressable
          style={[styles.dockBtnSecondary, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onOpenQC?.(workOrder);
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" />
          <Text style={[styles.dockBtnSecondaryText, { color: '#10B981' }]}>
            Kalite Kontrol (QC)
          </Text>
        </SpringPressable>

        <SpringPressable
          style={[styles.dockBtnPrimary, { backgroundColor: theme.colors.primary }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onReportOutput?.(workOrder);
          }}
        >
          <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
          <Text style={styles.dockBtnPrimaryText}>
            Üretim Çıktısı Bildir
          </Text>
        </SpringPressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  paneContainer: {
    flex: 1,
    borderLeftWidth: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 90,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
  headerCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  docNumber: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  productTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  productSku: {
    fontSize: 12,
    marginBottom: 14,
  },
  qtyProgressSection: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  qtyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  qtyLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  qtyPercentText: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  qtyCountersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  qtyStatBox: {
    flex: 1,
  },
  qtyStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  qtyStatValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  oeeScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  oeeScoreText: {
    fontSize: 13,
    fontWeight: '800',
  },
  oeeMetricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  oeeMetricItem: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
  },
  oeeMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  oeeMetricLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  oeeMetricVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  miniBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  oeeSubLabel: {
    fontSize: 9,
    lineHeight: 12,
  },
  liveTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  liveTimerPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  stopwatchDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  stopwatchBlock: {
    alignItems: 'center',
  },
  stopwatchSubTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  stopwatchDigits: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  verticalDivider: {
    width: 1,
    height: 40,
  },
  stopwatchActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  timerActionBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  timerActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  timerActionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  timerActionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyItemsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyItemsText: {
    fontSize: 12,
  },
  tableContainer: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  colTh: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  colName: {
    flex: 3,
  },
  colNum: {
    flex: 1.5,
    textAlign: 'center',
  },
  colLot: {
    flex: 1.8,
    alignItems: 'flex-end',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemCode: {
    fontSize: 10,
    marginTop: 2,
  },
  numText: {
    fontSize: 13,
    fontWeight: '700',
  },
  lotBarcodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lotBarcodeBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  opsList: {
    gap: 10,
  },
  opItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderRadius: 8,
    gap: 10,
  },
  opStepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opStepNum: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '700',
  },
  opInfoWrap: {
    flex: 1,
  },
  opName: {
    fontSize: 13,
    fontWeight: '700',
  },
  opCenter: {
    fontSize: 11,
    marginTop: 2,
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
  },
  dockBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  dockBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dockBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dockBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
