// apps/mobile/src/screens/ProductionScreen.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { MasterDetailContainer } from '../navigation/MasterDetailContainer';
import { useAppDispatch, useAppSelector } from '../store/redux';
import {
  selectShopFloorTimer,
  selectFormattedElapsedTime,
  selectFormattedDowntime,
  startTimer,
  stopTimer,
  resetTimer,
} from '../store/redux/shopFloorTimerSlice';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderItem,
  WorkOrderListParams,
  QCInspectionDTO,
  getWorkOrders,
  changeWorkOrderStatus,
} from '../services/production.service';
import {
  ProductionConsoleInspectionPane,
  WorkOrderCard,
  ShopFloorTimerBar,
  ProductionOutputModal,
  DowntimeReasonModal,
  QualityChecklistModal,
} from '../features/production';
import { RootStackParamList } from '../types/navigation.types';

type WorkOrderFilter = 'ALL' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

export default function ProductionScreen() {
  const { theme } = useTheme();
  const { showMasterDetail } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dispatch = useAppDispatch();

  const timer = useAppSelector(selectShopFloorTimer);
  const formattedElapsedTime = useAppSelector(selectFormattedElapsedTime);
  const formattedDowntime = useAppSelector(selectFormattedDowntime);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<WorkOrderFilter>('ALL');

  // Selected work order for tablet split-view inspection & modals
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [selectedWoForOutput, setSelectedWoForOutput] = useState<WorkOrder | null>(null);
  const [qcModalWo, setQcModalWo] = useState<WorkOrder | null>(null);
  const [downtimeModalVisible, setDowntimeModalVisible] = useState<boolean>(false);

  const loadWorkOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: WorkOrderListParams = { limit: 50 };
      if (activeFilter !== 'ALL') {
        params.status = activeFilter;
      }
      const res = await getWorkOrders(params);
      const items = res.items || [];
      setWorkOrders(items);
      setTotalCount(res.total || 0);

      // Default select first work order in Master-Detail mode if none selected
      setSelectedWorkOrder((current) => {
        if (!current && items.length > 0) return items[0];
        if (current) {
          const matched = items.find((w) => w.id === current.id);
          return matched || (items.length > 0 ? items[0] : null);
        }
        return null;
      });
    } catch {
      Alert.alert('Bağlantı Hatası', 'Üretim iş emirleri yüklenemedi.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  const onRefresh = () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    loadWorkOrders();
  };

  // Filtered by search query
  const filteredWorkOrders = useMemo(() => {
    if (!searchQuery.trim()) return workOrders;
    const q = searchQuery.toLowerCase().trim();
    return workOrders.filter((wo) => {
      const numMatch = wo.number.toLowerCase().includes(q);
      const prodNameMatch = wo.product?.name?.toLowerCase().includes(q);
      const prodSkuMatch = wo.product?.code?.toLowerCase().includes(q);
      const bomMatch = wo.bom?.name?.toLowerCase().includes(q);
      return Boolean(numMatch || prodNameMatch || prodSkuMatch || bomMatch);
    });
  }, [workOrders, searchQuery]);

  const handleStartTimer = (wo: WorkOrder) => {
    if (timer.isRunning && timer.activeWorkOrderId === wo.id) {
      // Toggle off / stop
      dispatch(stopTimer());
    } else {
      // Start new timer on this work order
      dispatch(
        startTimer({
          workOrderId: wo.id,
          workOrderNumber: wo.number,
          productName: wo.product?.name,
        })
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  const handleFinishAndReport = (woId: string, _elapsedSeconds: number) => {
    const target = workOrders.find((w) => w.id === woId);
    if (target) {
      setSelectedWoForOutput(target);
    }
  };

  const handleOutputReported = (_woId: string) => {
    dispatch(resetTimer());
    loadWorkOrders();
  };

  const handleChangeStatus = (wo: WorkOrder) => {
    Alert.alert(
      'İş Emri Durumu',
      `"${wo.number}" için yeni durum seçin:`,
      [
        {
          text: 'Üretime Başla (IN_PROGRESS)',
          onPress: async () => {
            await changeWorkOrderStatus(wo.id, 'IN_PROGRESS');
            loadWorkOrders();
          },
        },
        {
          text: 'Duraklat (PAUSED)',
          onPress: async () => {
            await changeWorkOrderStatus(wo.id, 'PAUSED');
            loadWorkOrders();
          },
        },
        {
          text: 'Tamamla (COMPLETED)',
          onPress: async () => {
            await changeWorkOrderStatus(wo.id, 'COMPLETED');
            loadWorkOrders();
          },
        },
        { text: 'Vazgeç', style: 'cancel' },
      ]
    );
  };

  const handleApplyQC = (qc: QCInspectionDTO) => {
    setQcModalWo(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const isPassed = qc.visualPassed && qc.dimensionPassed !== false && qc.functionalPassed !== false;
    Alert.alert(
      'Kalite Kontrol Kaydedildi',
      isPassed ? 'Parça kalite kontrol kriterlerini başarıyla sağladı.' : 'Kusurlar ve fire miktarı kaydedildi.'
    );
    loadWorkOrders();
  };

  const handleScanLotBarcode = (item: WorkOrderItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert(
      'Lot / Barkod Tarayıcı',
      `"${item.product?.name || 'Hammadde'}" için lot numarası otomatik eşlendi: LOT-2026-X88`
    );
  };

  const activeWorkOrder = selectedWorkOrder || (workOrders.length > 0 ? workOrders[0] : null);

  // ── Master Pane Content ──
  const masterContent = (
    <View style={styles.masterInner}>
      {/* ── Screen Header ── */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderBottomColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.colors.borderSubtle }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Üretim Takibi (Shop Floor)
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
            {totalCount} İş Emri Kaydı • Tezgâh Konsolu
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: theme.colors.borderSubtle }]}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Search Bar & Filter Chips ── */}
      <View style={styles.topFilterWrapper}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
              borderRadius: theme.borderRadius.md,
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="İş emri no, ürün adı veya SKU ara..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {[
            { key: 'ALL', label: 'Tüm Emirler' },
            { key: 'IN_PROGRESS', label: 'Üretimde' },
            { key: 'PLANNED', label: 'Planlanan' },
            { key: 'COMPLETED', label: 'Tamamlanan' },
          ].map((f) => {
            const isSelected = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.surfaceCard,
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.borderSubtle,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setActiveFilter(f.key as WorkOrderFilter);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isSelected ? '#ffffff' : theme.colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Work Orders List ── */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
            Üretim iş emirleri yükleniyor...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredWorkOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            !showMasterDetail && timer.isRunning && { paddingBottom: 110 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => {
            const isSelected = activeWorkOrder?.id === item.id;
            return (
              <View
                style={[
                  showMasterDetail && isSelected && {
                    borderLeftWidth: 3,
                    borderLeftColor: theme.colors.primary,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surface2,
                  },
                ]}
              >
                <WorkOrderCard
                  workOrder={item}
                  isTimerRunningForThis={timer.isRunning && timer.activeWorkOrderId === item.id}
                  onPress={(wo) => {
                    setSelectedWorkOrder(wo);
                  }}
                  onStartTimer={handleStartTimer}
                  onReportOutput={(wo) => setSelectedWoForOutput(wo)}
                  onChangeStatus={handleChangeStatus}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="construct-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                İş Emri Bulunamadı
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                Seçili kriterlere uygun üretim iş emri kaydı bulunamadı.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );

  // ── Detail Pane Content (Tablet Split-View) ──
  const detailContent = (
    <ProductionConsoleInspectionPane
      workOrder={activeWorkOrder}
      isTimerRunning={timer.isRunning && timer.activeWorkOrderId === activeWorkOrder?.id}
      formattedElapsedTime={formattedElapsedTime}
      formattedDowntime={formattedDowntime}
      onStartTimer={handleStartTimer}
      onReportOutput={(wo) => setSelectedWoForOutput(wo)}
      onOpenDowntime={() => setDowntimeModalVisible(true)}
      onOpenQC={(wo) => setQcModalWo(wo)}
      onChangeStatus={handleChangeStatus}
      onScanLotBarcode={handleScanLotBarcode}
    />
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      {showMasterDetail ? (
        <MasterDetailContainer
          masterView={masterContent}
          detailView={detailContent}
          masterWidth={390}
          emptyDetailTitle="Tezgâh İş Emri Seçin"
          emptyDetailSubtitle="Canlı OEE göstergesi, BOM reçete malzeme tablosu ve operasyon kronometresi bu alanda görüntülenecektir."
          emptyDetailIcon="hardware-chip-outline"
        />
      ) : (
        masterContent
      )}

      {/* ── Live Digital Stopwatch Bar (Mobile Only) ── */}
      {!showMasterDetail && (
        <ShopFloorTimerBar onFinishAndReport={handleFinishAndReport} />
      )}

      {/* ── Production Output Modal ── */}
      <ProductionOutputModal
        visible={Boolean(selectedWoForOutput)}
        workOrder={selectedWoForOutput}
        onClose={() => setSelectedWoForOutput(null)}
        onOutputReported={handleOutputReported}
      />

      {/* ── Quality Checklist Modal (Faz 23.1) ── */}
      <QualityChecklistModal
        visible={Boolean(qcModalWo)}
        workOrder={qcModalWo}
        onClose={() => setQcModalWo(null)}
        onApplyQC={handleApplyQC}
      />

      {/* ── Downtime Reason Modal (Faz 23.1) ── */}
      <DowntimeReasonModal
        visible={downtimeModalVisible}
        onClose={() => setDowntimeModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  masterInner: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topFilterWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  filterChipsRow: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
