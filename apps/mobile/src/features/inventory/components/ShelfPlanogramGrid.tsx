// apps/mobile/src/features/inventory/components/ShelfPlanogramGrid.tsx

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { Badge } from '../../../components/common/Badge';

export interface PlanogramBin {
  id: string;
  code: string; // e.g., "A-01-03"
  aisle: string; // "A-01"
  shelf: string; // "Kat B"
  section: string; // "Göz 03"
  occupancyPercent: number; // 0 - 100
  totalQuantity: number;
  items: Array<{
    productId: string;
    code: string;
    name: string;
    quantity: number;
    unit: string;
  }>;
}

export interface ShelfPlanogramGridProps {
  warehouseName?: string;
  bins?: PlanogramBin[];
  onStartCountForBin?: (bin: PlanogramBin) => void;
  onTransferBin?: (bin: PlanogramBin) => void;
}

// Sample realistic demo data if bins are empty
const DEMO_BINS: PlanogramBin[] = [
  // Aisle A-01
  {
    id: 'bin-1',
    code: 'A-01-D1',
    aisle: 'A-01',
    shelf: 'Kat D (4)',
    section: 'Göz 01',
    occupancyPercent: 90,
    totalQuantity: 450,
    items: [
      { productId: 'p1', code: 'PRD-101', name: 'Endüstriyel Hidrolik Valf 1/2"', quantity: 300, unit: 'AD' },
      { productId: 'p2', code: 'PRD-102', name: 'O-Ring Conta Seti (100 lü)', quantity: 150, unit: 'PK' },
    ],
  },
  {
    id: 'bin-2',
    code: 'A-01-D2',
    aisle: 'A-01',
    shelf: 'Kat D (4)',
    section: 'Göz 02',
    occupancyPercent: 20,
    totalQuantity: 40,
    items: [{ productId: 'p3', code: 'PRD-103', name: 'Pnömatik Bağlantı Rakoru', quantity: 40, unit: 'AD' }],
  },
  {
    id: 'bin-3',
    code: 'A-01-D3',
    aisle: 'A-01',
    shelf: 'Kat D (4)',
    section: 'Göz 03',
    occupancyPercent: 0,
    totalQuantity: 0,
    items: [],
  },
  {
    id: 'bin-4',
    code: 'A-01-C1',
    aisle: 'A-01',
    shelf: 'Kat C (3)',
    section: 'Göz 01',
    occupancyPercent: 75,
    totalQuantity: 210,
    items: [{ productId: 'p4', code: 'PRD-104', name: 'Solenoid Bobin 24V DC', quantity: 210, unit: 'AD' }],
  },
  {
    id: 'bin-5',
    code: 'A-01-C2',
    aisle: 'A-01',
    shelf: 'Kat C (3)',
    section: 'Göz 02',
    occupancyPercent: 88,
    totalQuantity: 380,
    items: [{ productId: 'p5', code: 'PRD-105', name: 'Rulman 6204-2RS', quantity: 380, unit: 'AD' }],
  },
  {
    id: 'bin-6',
    code: 'A-01-C3',
    aisle: 'A-01',
    shelf: 'Kat C (3)',
    section: 'Göz 03',
    occupancyPercent: 40,
    totalQuantity: 95,
    items: [{ productId: 'p6', code: 'PRD-106', name: 'Yağ Keçesi 25x47x7', quantity: 95, unit: 'AD' }],
  },
  {
    id: 'bin-7',
    code: 'A-01-B1',
    aisle: 'A-01',
    shelf: 'Kat B (2)',
    section: 'Göz 01',
    occupancyPercent: 60,
    totalQuantity: 180,
    items: [{ productId: 'p7', code: 'PRD-107', name: 'Basınç Sensörü 0-10 Bar', quantity: 180, unit: 'AD' }],
  },
  {
    id: 'bin-8',
    code: 'A-01-B2',
    aisle: 'A-01',
    shelf: 'Kat B (2)',
    section: 'Göz 02',
    occupancyPercent: 0,
    totalQuantity: 0,
    items: [],
  },
  {
    id: 'bin-9',
    code: 'A-01-B3',
    aisle: 'A-01',
    shelf: 'Kat B (2)',
    section: 'Göz 03',
    occupancyPercent: 30,
    totalQuantity: 65,
    items: [{ productId: 'p8', code: 'PRD-108', name: 'Manometre 0-6 Bar', quantity: 65, unit: 'AD' }],
  },
  {
    id: 'bin-10',
    code: 'A-01-A1',
    aisle: 'A-01',
    shelf: 'Kat A (1)',
    section: 'Göz 01',
    occupancyPercent: 95,
    totalQuantity: 620,
    items: [{ productId: 'p9', code: 'PRD-109', name: 'Ağır Hizmet Zincir Dişli', quantity: 620, unit: 'AD' }],
  },
  {
    id: 'bin-11',
    code: 'A-01-A2',
    aisle: 'A-01',
    shelf: 'Kat A (1)',
    section: 'Göz 02',
    occupancyPercent: 55,
    totalQuantity: 140,
    items: [{ productId: 'p10', code: 'PRD-110', name: 'Kaplin Lastiği Tip 4', quantity: 140, unit: 'AD' }],
  },
  {
    id: 'bin-12',
    code: 'A-01-A3',
    aisle: 'A-01',
    shelf: 'Kat A (1)',
    section: 'Göz 03',
    occupancyPercent: 15,
    totalQuantity: 30,
    items: [{ productId: 'p11', code: 'PRD-111', name: 'Segman Seti Din 471', quantity: 30, unit: 'PK' }],
  },
];

export const ShelfPlanogramGrid: React.FC<ShelfPlanogramGridProps> = ({
  warehouseName = 'Ana Lojistik Depo',
  bins = DEMO_BINS,
  onStartCountForBin,
  onTransferBin,
}) => {
  const { theme } = useTheme();

  // Extract unique aisles
  const aisles = useMemo(() => {
    const set = new Set<string>();
    bins.forEach((b) => set.add(b.aisle));
    return Array.from(set);
  }, [bins]);

  const [selectedAisle, setSelectedAisle] = useState<string>(aisles[0] || 'A-01');
  const [selectedBin, setSelectedBin] = useState<PlanogramBin | null>(bins[0] || null);

  // Filter bins by selected aisle
  const currentAisleBins = useMemo(() => {
    return bins.filter((b) => b.aisle === selectedAisle);
  }, [bins, selectedAisle]);

  // Group bins by shelf levels
  const shelfLevels = useMemo(() => {
    const map = new Map<string, PlanogramBin[]>();
    currentAisleBins.forEach((b) => {
      const list = map.get(b.shelf) || [];
      list.push(b);
      map.set(b.shelf, list);
    });
    return Array.from(map.entries());
  }, [currentAisleBins]);

  const getOccupancyColor = (percent: number) => {
    if (percent === 0) return theme.colors.borderSubtle;
    if (percent <= 50) return theme.colors.primary;
    if (percent <= 85) return theme.colors.amberPulse;
    return theme.colors.crimsonLaser;
  };

  const handleSelectBin = (bin: PlanogramBin) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedBin(bin);
  };

  return (
    <View style={styles.container}>
      {/* ── Top Header: Warehouse Title & Aisle Tabs ── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.subTitle, { color: theme.colors.textMuted }]}>
            DİJİTAL RAF PLANOGRAMI
          </Text>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {warehouseName}
          </Text>
        </View>

        {/* Aisle Selection Chips */}
        <View style={styles.aisleChipsRow}>
          {aisles.map((aisle) => {
            const isActive = selectedAisle === aisle;
            return (
              <TouchableOpacity
                key={aisle}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSelectedAisle(aisle);
                }}
                style={[
                  styles.aisleChip,
                  {
                    backgroundColor: isActive ? theme.colors.primary : theme.colors.surface1,
                    borderColor: isActive ? theme.colors.primary : theme.colors.glassBorder,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="grid"
                  size={12}
                  color={isActive ? '#FFFFFF' : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.aisleChipText,
                    {
                      color: isActive ? '#FFFFFF' : theme.colors.textSecondary,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                >
                  Koridor {aisle}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Main Layout: Left Planogram Matrix + Right Bin Inspector ── */}
      <View style={styles.splitWrapper}>
        {/* Left Side: 2D Matrix */}
        <ScrollView
          style={[
            styles.matrixContainer,
            {
              backgroundColor: theme.colors.surface0,
              borderColor: theme.colors.glassBorder,
            },
          ]}
          contentContainerStyle={styles.matrixContent}
          showsVerticalScrollIndicator={false}
        >
          {shelfLevels.map(([shelfName, rowBins]) => (
            <View key={shelfName} style={styles.shelfRow}>
              {/* Shelf Level Label */}
              <View style={styles.shelfLabelWrap}>
                <Text style={[styles.shelfLabelText, { color: theme.colors.textSecondary }]}>
                  {shelfName}
                </Text>
              </View>

              {/* Bins in this Shelf Level */}
              <View style={styles.binsRow}>
                {rowBins.map((bin) => {
                  const isSelected = selectedBin?.id === bin.id;
                  const occColor = getOccupancyColor(bin.occupancyPercent);

                  return (
                    <TouchableOpacity
                      key={bin.id}
                      onPress={() => handleSelectBin(bin)}
                      style={[
                        styles.binCell,
                        {
                          backgroundColor: theme.colors.surface1,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.glassBorder,
                        },
                        isSelected && {
                          borderWidth: 2,
                          shadowColor: theme.colors.primary,
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 6,
                          elevation: 4,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={styles.binCellHeader}>
                        <Text
                          style={[
                            styles.binCode,
                            { color: isSelected ? theme.colors.primary : theme.colors.textPrimary },
                          ]}
                        >
                          {bin.code}
                        </Text>
                        <View
                          style={[
                            styles.occDot,
                            { backgroundColor: occColor },
                          ]}
                        />
                      </View>

                      {/* Mini Bar */}
                      <View
                        style={[
                          styles.miniBarTrack,
                          { backgroundColor: theme.colors.surface2 },
                        ]}
                      >
                        <View
                          style={[
                            styles.miniBarFill,
                            {
                              width: `${bin.occupancyPercent}%`,
                              backgroundColor: occColor,
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.binCellFooter}>
                        <TabularText style={[styles.qtyText, { color: theme.colors.textSecondary }]}>
                          {bin.totalQuantity} adet
                        </TabularText>
                        <Text style={[styles.percentText, { color: occColor }]}>
                          %{bin.occupancyPercent}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.borderSubtle }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Boş (%0)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Normal (%1-50)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.amberPulse }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Yoğun (%51-85)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.crimsonLaser }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.textMuted }]}>Dolu (%85+)</Text>
            </View>
          </View>
        </ScrollView>

        {/* Right Side: Selected Shelf Bin Inspector */}
        <View
          style={[
            styles.inspectorContainer,
            {
              backgroundColor: theme.colors.surface0,
              borderColor: theme.colors.glassBorder,
            },
          ]}
        >
          {selectedBin ? (
            <View style={styles.inspectorContent}>
              {/* Bin Header */}
              <View style={styles.inspectorHeader}>
                <View>
                  <Text style={[styles.inspectorSub, { color: theme.colors.textMuted }]}>
                    SEÇİLİ RAF KONUMU
                  </Text>
                  <Text style={[styles.inspectorTitle, { color: theme.colors.textPrimary }]}>
                    {selectedBin.code}
                  </Text>
                  <Text style={[styles.inspectorLocation, { color: theme.colors.textSecondary }]}>
                    {selectedBin.aisle} · {selectedBin.shelf} · {selectedBin.section}
                  </Text>
                </View>

                <Badge
                  label={`%${selectedBin.occupancyPercent} Dolu`}
                  variant={
                    selectedBin.occupancyPercent > 85
                      ? 'danger'
                      : selectedBin.occupancyPercent > 50
                      ? 'warning'
                      : 'success'
                  }
                  size="md"
                />
              </View>

              {/* Progress Bar */}
              <View
                style={[
                  styles.inspectProgressTrack,
                  { backgroundColor: theme.colors.surface2 },
                ]}
              >
                <View
                  style={[
                    styles.inspectProgressFill,
                    {
                      width: `${selectedBin.occupancyPercent}%`,
                      backgroundColor: getOccupancyColor(selectedBin.occupancyPercent),
                    },
                  ]}
                />
              </View>

              {/* Items in this Bin */}
              <View style={styles.itemsSection}>
                <Text style={[styles.itemsSectionTitle, { color: theme.colors.textPrimary }]}>
                  Raftaki Ürünler ({selectedBin.items.length})
                </Text>

                <ScrollView style={styles.itemsScrollView} showsVerticalScrollIndicator={false}>
                  {selectedBin.items.length === 0 ? (
                    <View style={styles.emptyItems}>
                      <Ionicons name="cube-outline" size={32} color={theme.colors.textMuted} />
                      <Text style={[styles.emptyItemsText, { color: theme.colors.textMuted }]}>
                        Bu gözde şu anda stok kalemi bulunmuyor.
                      </Text>
                    </View>
                  ) : (
                    selectedBin.items.map((item) => (
                      <View
                        key={item.productId}
                        style={[
                          styles.itemRow,
                          {
                            backgroundColor: theme.colors.surface1,
                            borderColor: theme.colors.glassBorder,
                          },
                        ]}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={[styles.itemCode, { color: theme.colors.primary }]}>
                            {item.code}
                          </Text>
                          <Text
                            style={[styles.itemName, { color: theme.colors.textPrimary }]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                        </View>

                        <TabularText style={[styles.itemQty, { color: theme.colors.textPrimary }]}>
                          {item.quantity} {item.unit}
                        </TabularText>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>

              {/* Action Buttons */}
              <View style={styles.inspectorActions}>
                {onTransferBin && (
                  <SpringPressable
                    onPress={() => onTransferBin(selectedBin)}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: theme.colors.surface2,
                        borderColor: theme.colors.glassBorder,
                      },
                    ]}
                  >
                    <Ionicons name="swap-horizontal" size={16} color={theme.colors.textPrimary} />
                    <Text style={[styles.actionBtnText, { color: theme.colors.textPrimary }]}>
                      Lokasyon Taşı
                    </Text>
                  </SpringPressable>
                )}

                {onStartCountForBin && (
                  <SpringPressable
                    onPress={() => onStartCountForBin(selectedBin)}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <Ionicons name="clipboard-outline" size={16} color="#FFFFFF" />
                    <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                      Gözü Say
                    </Text>
                  </SpringPressable>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.emptyInspector}>
              <Ionicons name="scan-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyInspectorTitle, { color: theme.colors.textPrimary }]}>
                Raf Seçilmedi
              </Text>
              <Text style={[styles.emptyInspectorDesc, { color: theme.colors.textMuted }]}>
                Stok miktarlarını ve ürün kalemlerini görüntülemek için sol plandaki bir göze dokunun.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  subTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  aisleChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  aisleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  aisleChipText: {
    fontSize: 12,
  },
  splitWrapper: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
  },
  matrixContainer: {
    flex: 0.62,
    borderWidth: 1,
    borderRadius: 18,
  },
  matrixContent: {
    padding: 16,
    gap: 14,
  },
  shelfRow: {
    gap: 6,
  },
  shelfLabelWrap: {
    paddingBottom: 2,
  },
  shelfLabelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  binsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  binCell: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  binCellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  binCode: {
    fontSize: 12,
    fontWeight: '800',
  },
  occDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  miniBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  binCellFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 10,
    fontWeight: '600',
  },
  percentText: {
    fontSize: 10,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  inspectorContainer: {
    flex: 0.38,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  inspectorContent: {
    flex: 1,
    padding: 16,
    gap: 14,
  },
  inspectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  inspectorSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  inspectorTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  inspectorLocation: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  inspectProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  inspectProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  itemsSection: {
    flex: 1,
    gap: 8,
  },
  itemsSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  itemsScrollView: {
    flex: 1,
  },
  emptyItems: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyItemsText: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 200,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  itemCode: {
    fontSize: 10,
    fontWeight: '700',
  },
  itemName: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemQty: {
    fontSize: 12,
    fontWeight: '800',
  },
  inspectorActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyInspector: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyInspectorTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyInspectorDesc: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 220,
  },
});
