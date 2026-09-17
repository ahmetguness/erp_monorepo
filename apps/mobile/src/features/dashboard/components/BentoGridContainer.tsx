// apps/mobile/src/features/dashboard/components/BentoGridContainer.tsx

import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { HeroRevenueCard } from './HeroRevenueCard';
import { BentoWidget } from '../../../design-system/primitives/BentoWidget';
import { formatCurrency } from '../../../lib/utils';
import { MobileDashboardData } from '../../../services/dashboard.service';

export interface BentoGridContainerProps {
  data: MobileDashboardData;
  activeBiTab: 'SALES' | 'CASHFLOW' | 'CATEGORY';
  setActiveBiTab: (tab: 'SALES' | 'CASHFLOW' | 'CATEGORY') => void;
  renderBiChart: () => React.ReactNode;
  renderActivityStream: () => React.ReactNode;
  onNavigateFinance: (initialTab: string) => void;
  onNavigateInventory: () => void;
  onNavigateFieldVisit: () => void;
  onNavigateCopilot: () => void;
}

export const BentoGridContainer: React.FC<BentoGridContainerProps> = ({
  data,
  activeBiTab,
  setActiveBiTab,
  renderBiChart,
  renderActivityStream,
  onNavigateFinance,
  onNavigateInventory,
  onNavigateFieldVisit,
  onNavigateCopilot,
}) => {
  const { theme } = useTheme();
  const sales = data?.salesSummary;
  const finance = data?.financeSummary;
  const ops = data?.operationsSummary;

  const changeIsPositive = (sales?.changePercent ?? 0) >= 0;

  return (
    <View style={styles.container}>
      {/* ── ROW 1: Top Hero & Liquidity ── */}
      <View style={styles.row}>
        <View style={styles.colSpan2}>
          <HeroRevenueCard
            todayGross={sales?.todayGross ?? 0}
            todayCount={sales?.todayCount ?? 0}
            changePercent={sales?.changePercent ?? 0}
            changeIsPositive={changeIsPositive}
            targetProgress={sales?.targetProgress ?? 0}
          />
        </View>

        <View style={styles.colSpan1}>
          <BentoWidget
            title="Kasa & Banka"
            value={formatCurrency(finance?.cashBankTotal ?? 0)}
            subtitle="Toplam Net Nakit Varlık"
            icon="wallet-outline"
            iconColor="#3B82F6"
            iconBg="rgba(59, 130, 246, 0.15)"
            badge={{ label: 'LİKİT', variant: 'primary', pulse: true }}
            glow="primary"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onNavigateFinance('treasury');
            }}
            style={styles.cardFillHeight}
          />
        </View>
      </View>

      {/* ── ROW 2: 3-Column Operational Metrics ── */}
      <View style={styles.row}>
        <View style={styles.col1of3}>
          <BentoWidget
            title="Gecikmiş Alacak"
            value={formatCurrency(finance?.overdueTotal ?? 0)}
            subtitle={`${finance?.overdueCount ?? 0} Fatura Vadesi Geçti`}
            icon="alert-circle-outline"
            iconColor={theme.colors.crimsonLaser}
            iconBg="rgba(239, 68, 68, 0.15)"
            badge={{
              label: (finance?.overdueCount ?? 0) > 0 ? 'TAKİP' : 'DÜZENLİ',
              variant: (finance?.overdueCount ?? 0) > 0 ? 'crimson' : 'emerald',
              pulse: (finance?.overdueCount ?? 0) > 0,
            }}
            glow={(finance?.overdueCount ?? 0) > 0 ? 'crimson' : 'none'}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onNavigateFinance('overdue');
            }}
          />
        </View>

        <View style={styles.col1of3}>
          <BentoWidget
            title="Bekleyen Sipariş"
            value={`${ops?.pendingOrders ?? 0} Adet`}
            subtitle="Hazırlanacak ve Sevk Edilecek"
            icon="cart-outline"
            iconColor={theme.colors.emeraldNeon}
            iconBg="rgba(16, 185, 129, 0.15)"
            badge={{ label: 'SEVKİYAT', variant: 'emerald', pulse: false }}
            glow="none"
          />
        </View>

        <View style={styles.col1of3}>
          <BentoWidget
            title="Kritik Stok"
            value={`${ops?.criticalStockCount ?? 0} Ürün`}
            subtitle="Asgari Düzeyin Altında"
            icon="cube-outline"
            iconColor={theme.colors.amberPulse}
            iconBg="rgba(245, 158, 11, 0.15)"
            badge={{
              label: (ops?.criticalStockCount ?? 0) > 0 ? 'KRİTİK' : 'YETERLİ',
              variant: (ops?.criticalStockCount ?? 0) > 0 ? 'amber' : 'emerald',
              pulse: (ops?.criticalStockCount ?? 0) > 0,
            }}
            glow={(ops?.criticalStockCount ?? 0) > 0 ? 'amber' : 'none'}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onNavigateInventory();
            }}
          />
        </View>
      </View>

      {/* ── ROW 3: BI Analytics Chart (Left) & Live Activity Feed (Right) ── */}
      <View style={styles.row}>
        {/* Left: 2-Column Wide Analytics Box */}
        <View style={styles.colSpan2}>
          <View
            style={[
              styles.chartContainer,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.glassBorder,
              },
            ]}
          >
            {/* Chart Header with Pills */}
            <View style={styles.chartHeader}>
              <View style={styles.chartTitleWrap}>
                <View style={[styles.chartIconBg, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="stats-chart" size={17} color={theme.colors.primary} />
                </View>
                <Text style={[styles.chartTitle, { color: theme.colors.textPrimary }]}>
                  İş Zekası & Trend Analitiği
                </Text>
              </View>

              <View style={[styles.tabBarPillGroup, { backgroundColor: theme.colors.surface0 }]}>
                {(['SALES', 'CASHFLOW', 'CATEGORY'] as const).map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setActiveBiTab(tab);
                    }}
                    style={[
                      styles.tabPillBtn,
                      activeBiTab === tab && {
                        backgroundColor: theme.colors.surface2,
                        borderColor: theme.colors.glassBorderActive,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabPillText,
                        {
                          color: activeBiTab === tab ? theme.colors.primary : theme.colors.textSecondary,
                          fontWeight: activeBiTab === tab ? '700' : '500',
                        },
                      ]}
                    >
                      {tab === 'SALES' ? 'Satış' : tab === 'CASHFLOW' ? 'Nakit' : 'Kategori'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Chart Canvas */}
            <View style={styles.chartBody}>{renderBiChart()}</View>
          </View>
        </View>

        {/* Right: 1-Column Live Stream */}
        <View style={styles.colSpan1}>
          <View
            style={[
              styles.streamContainer,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.glassBorder,
              },
            ]}
          >
            <View style={styles.streamHeader}>
              <View style={[styles.streamIconBg, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="pulse" size={16} color={theme.colors.emeraldNeon} />
              </View>
              <Text style={[styles.streamTitle, { color: theme.colors.textPrimary }]}>
                Canlı Hareket Akışı
              </Text>
            </View>
            <View style={styles.streamBody}>{renderActivityStream()}</View>
          </View>
        </View>
      </View>

      {/* ── ROW 4: Fast Action Bento Widgets ── */}
      <View style={styles.row}>
        <View style={styles.col1of3}>
          <BentoWidget
            title="Saha Ziyareti"
            value="GPS Check-In"
            subtitle="Müşteri Konumuna Uğra ve Raporla"
            icon="location-outline"
            iconColor="#06B6D4"
            iconBg="rgba(6, 182, 212, 0.15)"
            badge={{ label: 'MÜŞTERİ', variant: 'cyan', pulse: false }}
            onPress={onNavigateFieldVisit}
          />
        </View>

        <View style={styles.col1of3}>
          <BentoWidget
            title="Depo & WMS 2.0"
            value="Raf & Barkod"
            subtitle="Hızlı Sayım, Transfer ve Mal Kabul"
            icon="barcode-outline"
            iconColor="#8B5CF6"
            iconBg="rgba(139, 92, 246, 0.15)"
            badge={{ label: 'WMS', variant: 'primary', pulse: false }}
            onPress={onNavigateInventory}
          />
        </View>

        <View style={styles.col1of3}>
          <BentoWidget
            title="Copilot AI Asistan"
            value="Akıllı Analiz"
            subtitle="ERP Veritabanına Doğal Dilde Sor"
            icon="sparkles-outline"
            iconColor="#F59E0B"
            iconBg="rgba(245, 158, 11, 0.15)"
            badge={{ label: 'AI COPILOT', variant: 'amber', pulse: true }}
            glow="amber"
            onPress={onNavigateCopilot}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  colSpan2: {
    flex: 2,
  },
  colSpan1: {
    flex: 1,
  },
  col1of3: {
    flex: 1,
  },
  cardFillHeight: {
    height: '100%',
  },
  chartContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    minHeight: 280,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chartIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  tabBarPillGroup: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  tabPillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabPillText: {
    fontSize: 12,
  },
  chartBody: {
    paddingTop: 8,
  },
  streamContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    minHeight: 280,
  },
  streamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  streamIconBg: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  streamBody: {
    flex: 1,
  },
});
