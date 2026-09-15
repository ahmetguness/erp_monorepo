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
import { useTheme } from '../theme';
import { useAppDispatch, useAppSelector } from '../store/redux';
import {
  selectShopFloorTimer,
  startTimer,
  stopTimer,
  resetTimer,
} from '../store/redux/shopFloorTimerSlice';
import {
  WorkOrder,
  WorkOrderStatus,
  getWorkOrders,
  changeWorkOrderStatus,
} from '../services/production.service';
import {
  WorkOrderCard,
  ShopFloorTimerBar,
  ProductionOutputModal,
} from '../components/production';

type WorkOrderFilter = 'ALL' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

interface Props {
  navigation: any;
}

export default function ProductionScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();

  const timer = useAppSelector(selectShopFloorTimer);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<WorkOrderFilter>('ALL');

  // Selected work order for reporting
  const [selectedWoForOutput, setSelectedWoForOutput] = useState<WorkOrder | null>(null);

  const loadWorkOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = { limit: 50 };
      if (activeFilter !== 'ALL') {
        params.status = activeFilter;
      }
      const res = await getWorkOrders(params);
      setWorkOrders(res.items || []);
      setTotalCount(res.total || 0);
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
      return numMatch || prodNameMatch || prodSkuMatch || bomMatch;
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

  const handleOutputReported = (woId: string) => {
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

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
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
            {totalCount} İş Emri Kaydı • Operasyon Sayacı
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
            timer.isRunning && { paddingBottom: 110 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => (
            <WorkOrderCard
              workOrder={item}
              isTimerRunningForThis={timer.isRunning && timer.activeWorkOrderId === item.id}
              onStartTimer={handleStartTimer}
              onReportOutput={(wo) => setSelectedWoForOutput(wo)}
              onChangeStatus={handleChangeStatus}
            />
          )}
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

      {/* ── Live Digital Stopwatch Bar ── */}
      <ShopFloorTimerBar onFinishAndReport={handleFinishAndReport} />

      {/* ── Production Output Modal ── */}
      <ProductionOutputModal
        visible={Boolean(selectedWoForOutput)}
        workOrder={selectedWoForOutput}
        onClose={() => setSelectedWoForOutput(null)}
        onOutputReported={handleOutputReported}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
