import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/auth.store';
import { useNotificationStore } from '../store/notification.store';
import { useAppDispatch } from '../store/redux';
import { setMode } from '../store/redux/warehouseSessionSlice';
import { useTheme } from '../theme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { HeroRevenueCard, BentoGridContainer } from '../features/dashboard';
import { KpiCard } from '../components/dashboard/KpiCard';
import { QuickActionsBar } from '../components/dashboard/QuickActionsBar';
import { ActivityStream } from '../components/dashboard/ActivityStream';
import {
  SalesTrendChart,
  CashFlowBarChart,
  CategoryDonutChart,
} from '../components/dashboard/charts';
import { SpotlightSearchModal } from '../components/search/SpotlightSearchModal';
import { GlobalSearchResult } from '../services/search.service';
import { ChatBot } from '../components/ChatBot';
import { formatCurrency, initials } from '../lib/utils';
import {
  getMobileDashboard,
  MobileDashboardData,
  MobileDashboardActivity,
} from '../services/dashboard.service';
import {
  syncAllMasterData,
  getCacheMetadata,
  CacheMetadata,
} from '../services/offline-cache.service';
import { DashboardScreenNavigationProp } from '../types/navigation.types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function DashboardScreen() {
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const dispatch = useAppDispatch();
  const { user, tenant } = useAuthStore();
  const { theme } = useTheme();
  const { isTablet } = useResponsive();

  const {
    unreadCount,
    loadNotifications,
    initializePushNotifications,
  } = useNotificationStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<MobileDashboardData | null>(null);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [activeBiTab, setActiveBiTab] = useState<'SALES' | 'CASHFLOW' | 'CATEGORY'>('SALES');

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const data = await getMobileDashboard();
      setDashboardData(data);
      // Sync unread notification count
      useNotificationStore.getState().setUnreadCount(data.unreadNotificationCount);
    } catch (err: unknown) {
      console.warn('[DashboardScreen] Fetch error:', err);
      setError('Veriler yüklenirken bir sorun oluştu');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    loadNotifications();
  }, [fetchDashboard, loadNotifications]);

  const [cacheMeta, setCacheMeta] = useState<CacheMetadata | null>(null);
  const [isCaching, setIsCaching] = useState(false);

  useEffect(() => {
    getCacheMetadata().then(setCacheMeta).catch(() => {});
  }, []);

  const handleSyncOfflineCache = async () => {
    if (isCaching) return;
    setIsCaching(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const meta = await syncAllMasterData();
      setCacheMeta(meta);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      console.warn('[DashboardScreen] Failed to cache master data:', err);
    } finally {
      setIsCaching(false);
    }
  };

  useEffect(() => {
    initializePushNotifications();
  }, []);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Promise.all([fetchDashboard(), loadNotifications()]).finally(() => {
      setIsRefreshing(false);
    });
  }, [fetchDashboard, loadNotifications]);

  const handleOpenNotifications = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('Notifications');
  };

  const handleSwitchTenant = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('TenantSelect', { canGoBack: true });
  };

  const handleActivityPress = (activity: MobileDashboardActivity) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (activity.type === 'APPROVAL') {
      navigation.navigate('ApprovalsTab');
    } else if (activity.type === 'STOCK') {
      navigation.navigate('InventoryTab');
    } else {
      navigation.navigate('SalesTab');
    }
  };

  if (isLoading && !dashboardData) {
    return (
      <SafeAreaView
        style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
          Yönetici Dashboard yükleniyor...
        </Text>
      </SafeAreaView>
    );
  }

  const sales = dashboardData?.salesSummary;
  const finance = dashboardData?.financeSummary;
  const ops = dashboardData?.operationsSummary;
  const activities = dashboardData?.activities || [];

  const changeIsPositive = (sales?.changePercent ?? 0) >= 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      {/* ── Top Executive Header ── */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderBottomColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text style={styles.avatarText}>{initials(user?.name ?? 'U')}</Text>
          </View>

          <View style={styles.headerInfo}>
            <Text
              style={[
                styles.greeting,
                { color: theme.colors.text },
              ]}
              numberOfLines={1}
            >
              {getGreeting()}, {user?.name?.split(' ')[0]}
            </Text>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSwitchTenant}
              style={styles.companyRow}
            >
              <Ionicons name="business-outline" size={13} color={theme.colors.textSecondary} />
              <Text
                style={[styles.companyName, { color: theme.colors.textSecondary }]}
                numberOfLines={1}
              >
                {tenant?.companyName || 'Şirket Seçilmedi'}
              </Text>
              <Ionicons name="chevron-forward" size={12} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Spotlight Search Trigger (FAZ 17) */}
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: theme.colors.borderSubtle,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setIsSearchModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={20} color={theme.colors.text} />
          </TouchableOpacity>

          {/* Notification Bell with Badge */}
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: theme.colors.borderSubtle,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={handleOpenNotifications}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={21} color={theme.colors.text} />
            {unreadCount > 0 && (
              <View
                style={[
                  styles.bellBadge,
                  { backgroundColor: theme.colors.danger },
                ]}
              >
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Date ticker bar */}
      <View
        style={[
          styles.dateTicker,
          {
            backgroundColor: theme.colors.borderSubtle,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Ionicons name="calendar-outline" size={14} color={theme.colors.primary} />
        <Text style={[styles.dateText, { color: theme.colors.textSecondary }]}>
          {getTodayFormatted()}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Error notice if needed */}
        {error && (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: theme.colors.dangerMuted,
                borderColor: theme.colors.danger,
              },
            ]}
          >
            <Ionicons name="warning-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={fetchDashboard} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: theme.colors.danger }]}>Yenile</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Spotlight Search Bar Trigger (FAZ 17) ── */}
        <TouchableOpacity
          style={[
            styles.spotlightTriggerBar,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
              borderRadius: theme.borderRadius.md,
              ...theme.shadows.sm,
            },
          ]}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setIsSearchModalVisible(true);
          }}
        >
          <Ionicons name="search" size={17} color={theme.colors.primary} />
          <Text style={[styles.spotlightPlaceholder, { color: theme.colors.textMuted }]}>
            Müşteri, ürün, fatura veya sipariş ara...
          </Text>
          <View style={[styles.spotlightShortcut, { backgroundColor: theme.colors.borderSubtle }]}>
            <Text style={[styles.spotlightShortcutText, { color: theme.colors.textSecondary }]}>
              Spotlight
            </Text>
          </View>
        </TouchableOpacity>

        {isTablet && dashboardData ? (
          <BentoGridContainer
            data={dashboardData}
            activeBiTab={activeBiTab}
            setActiveBiTab={setActiveBiTab}
            renderBiChart={() => (
              <>
                {activeBiTab === 'SALES' && (
                  <SalesTrendChart data={dashboardData?.analytics?.salesTrend ?? []} />
                )}
                {activeBiTab === 'CASHFLOW' && (
                  <CashFlowBarChart data={dashboardData?.analytics?.cashFlowTrend ?? []} />
                )}
                {activeBiTab === 'CATEGORY' && (
                  <CategoryDonutChart data={dashboardData?.analytics?.categoryDistribution ?? []} />
                )}
              </>
            )}
            renderActivityStream={() => (
              <ActivityStream
                activities={activities}
                onActivityPress={handleActivityPress}
                onViewAllPress={() => {
                  navigation.navigate('SalesTab');
                }}
              />
            )}
            onNavigateFinance={(tab) => navigation.navigate('Finance', { initialTab: tab as any })}
            onNavigateInventory={() => navigation.navigate('InventoryTab')}
            onNavigateFieldVisit={() => navigation.navigate('FieldService')}
            onNavigateCopilot={() => navigation.navigate('Copilot')}
          />
        ) : (
          <>
            {/* ── Executive Hero Card: Günlük Satış (Glass Quantum) ── */}
            <HeroRevenueCard
              todayGross={sales?.todayGross ?? 0}
              todayCount={sales?.todayCount ?? 0}
              changePercent={sales?.changePercent ?? 0}
              changeIsPositive={changeIsPositive}
              targetProgress={sales?.targetProgress ?? 0}
            />
          </>
        )}

        {!isTablet && (
          <>
            {/* ── KPI 2x2 Grid ── */}
            <View style={styles.kpiGrid}>
          {/* Likidite */}
          <KpiCard
            title="Kasa & Banka"
            value={formatCurrency(finance?.cashBankTotal ?? 0)}
            subtitle="Toplam Net Nakit Varlık"
            badge={{ text: 'LİKİT', variant: 'info' }}
            icon="wallet-outline"
            iconColor="#2563eb"
            iconBg="#eff6ff"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              navigation.navigate('Finance', { initialTab: 'treasury' });
            }}
          />

          {/* Vadesi Geçmiş Alacak (FAZ 7) */}
          <KpiCard
            title="Gecikmiş Alacak"
            value={formatCurrency(finance?.overdueTotal ?? 0)}
            subtitle={`${finance?.overdueCount ?? 0} Fatura Gecikmede`}
            badge={{
              text: (finance?.overdueCount ?? 0) > 0 ? 'TAKİP' : 'DÜZENLİ',
              variant: (finance?.overdueCount ?? 0) > 0 ? 'danger' : 'success',
            }}
            icon="alert-circle-outline"
            iconColor="#ef4444"
            iconBg="#fef2f2"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              navigation.navigate('Finance', { initialTab: 'overdue' });
            }}
          />

          {/* Bekleyen Siparişler */}
          <KpiCard
            title="Bekleyen Sipariş"
            value={`${ops?.pendingOrders ?? 0}`}
            subtitle="Hazırlanacak / Sevk Edilecek"
            badge={{ text: 'SEVKİYAT', variant: 'warning' }}
            icon="cart-outline"
            iconColor="#10b981"
            iconBg="#ecfdf5"
          />

          {/* Kritik Stok */}
          <KpiCard
            title="Kritik Stok"
            value={`${ops?.criticalStockCount ?? 0}`}
            subtitle="Asgari Düzeyin Altında"
            badge={{
              text: (ops?.criticalStockCount ?? 0) > 0 ? 'KRİTİK' : 'YETERLİ',
              variant: (ops?.criticalStockCount ?? 0) > 0 ? 'danger' : 'success',
            }}
            icon="cube-outline"
            iconColor="#f59e0b"
            iconBg="#fffbeb"
          />
        </View>

        {/* ── Finans & Satış Analitiği (BI Trendleri - FAZ 17) ── */}
        <View
          style={[
            styles.analyticsCard,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
              borderRadius: theme.borderRadius.lg,
              ...theme.shadows.sm,
            },
          ]}
        >
          <View style={styles.analyticsHeader}>
            <View style={styles.analyticsTitleWrap}>
              <View style={[styles.analyticsIconBg, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="stats-chart" size={16} color={theme.colors.primary} />
              </View>
              <Text style={[styles.analyticsTitle, { color: theme.colors.text }]}>
                Finans & Satış Analitiği
              </Text>
            </View>

            {/* Tab Switcher Pills */}
            <View
              style={[
                styles.biTabsRow,
                { backgroundColor: theme.colors.background, borderColor: theme.colors.borderSubtle },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.biTabBtn,
                  activeBiTab === 'SALES' && [
                    styles.biTabBtnActive,
                    { backgroundColor: theme.colors.surfaceCard },
                  ],
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveBiTab('SALES');
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.biTabText,
                    {
                      color:
                        activeBiTab === 'SALES' ? theme.colors.primary : theme.colors.textMuted,
                      fontWeight: activeBiTab === 'SALES' ? '700' : '500',
                    },
                  ]}
                >
                  Satış
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.biTabBtn,
                  activeBiTab === 'CASHFLOW' && [
                    styles.biTabBtnActive,
                    { backgroundColor: theme.colors.surfaceCard },
                  ],
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveBiTab('CASHFLOW');
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.biTabText,
                    {
                      color:
                        activeBiTab === 'CASHFLOW' ? theme.colors.primary : theme.colors.textMuted,
                      fontWeight: activeBiTab === 'CASHFLOW' ? '700' : '500',
                    },
                  ]}
                >
                  Nakit
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.biTabBtn,
                  activeBiTab === 'CATEGORY' && [
                    styles.biTabBtnActive,
                    { backgroundColor: theme.colors.surfaceCard },
                  ],
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveBiTab('CATEGORY');
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.biTabText,
                    {
                      color:
                        activeBiTab === 'CATEGORY' ? theme.colors.primary : theme.colors.textMuted,
                      fontWeight: activeBiTab === 'CATEGORY' ? '700' : '500',
                    },
                  ]}
                >
                  Kategori
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Chart Display */}
          <View style={styles.chartContainer}>
            {activeBiTab === 'SALES' && (
              <SalesTrendChart data={dashboardData?.analytics?.salesTrend ?? []} />
            )}
            {activeBiTab === 'CASHFLOW' && (
              <CashFlowBarChart data={dashboardData?.analytics?.cashFlowTrend ?? []} />
            )}
            {activeBiTab === 'CATEGORY' && (
              <CategoryDonutChart data={dashboardData?.analytics?.categoryDistribution ?? []} />
            )}
          </View>
        </View>
        </>
        )}

        {/* ── Quick Actions Bar ── */}
        <QuickActionsBar
          pendingApprovalsCount={ops?.pendingApprovals ?? 0}
          onBarcodeScan={() => {
            dispatch(setMode('LOOKUP'));
            navigation.navigate('InventoryTab');
          }}
          onCreateOrder={() => {
            navigation.navigate('SalesTab');
          }}
          onAddPayment={() => {
            navigation.navigate('Finance', { initialTab: 'payments' });
          }}
          onPendingApprovals={() => {
            navigation.navigate('ApprovalsTab');
          }}
          onStockCount={() => {
            dispatch(setMode('COUNT'));
            navigation.navigate('InventoryTab');
          }}
        />

        {/* ── Saha, Üretim, Finans & İK Operasyonları (FAZ 6, 7 & 8) ── */}
        <View style={styles.operationsSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Saha, Üretim, Finans & İK Operasyonları
          </Text>
          <View style={styles.operationsGrid}>
            <TouchableOpacity
              style={[
                styles.opActionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('Finance', { initialTab: 'overdue' });
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.opIconWrap, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="cash" size={20} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opCardTitle, { color: theme.colors.text }]}>
                  Finans, Çek & Masraf Yönetimi
                </Text>
                <Text style={[styles.opCardDesc, { color: theme.colors.textMuted }]}>
                  Alacak takibi, çek/senet, saha masrafları & banka/kasa
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.opActionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('FieldService');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.opIconWrap, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="construct" size={20} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opCardTitle, { color: theme.colors.text }]}>
                  Saha Teknik Servis
                </Text>
                <Text style={[styles.opCardDesc, { color: theme.colors.textMuted }]}>
                  Çağrı listesi, müdahale, parça & müşteri imzası
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.opActionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('ProductionShopFloor');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.opIconWrap, { backgroundColor: '#ecfdf5' }]}>
                <Ionicons name="hardware-chip" size={20} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opCardTitle, { color: theme.colors.text }]}>
                  Üretim Takibi (Shop Floor)
                </Text>
                <Text style={[styles.opCardDesc, { color: theme.colors.textMuted }]}>
                  İş emirleri, dijital kronometre, fire & çıktı girişi
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.opActionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('EmployeePortal');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.opIconWrap, { backgroundColor: '#faf5ff' }]}>
                <Ionicons name="people" size={20} color="#8b5cf6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opCardTitle, { color: theme.colors.text }]}>
                  Çalışan Self-Servisi (İK & Bordro)
                </Text>
                <Text style={[styles.opCardDesc, { color: theme.colors.textMuted }]}>
                  İzin talepleri, vardiya & mesai, biyometrik maaş bordrosu
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            {/* FAZ 13: Satın Alma & Tedarik Zinciri */}
            <TouchableOpacity
              style={[
                styles.opActionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('Procurement');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.opIconWrap, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="cart" size={20} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opCardTitle, { color: theme.colors.text }]}>
                  Satın Alma & Tedarik Zinciri
                </Text>
                <Text style={[styles.opCardDesc, { color: theme.colors.textMuted }]}>
                  Tedarikçiler, satın alma talepleri (PR), açık siparişler (PO) & mal kabul
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.opActionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('Copilot');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.opIconWrap, { backgroundColor: '#f0f9ff' }]}>
                <Ionicons name="sparkles" size={20} color="#0284c7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opCardTitle, { color: theme.colors.text }]}>
                  AXON AI Mobil Asistan (Copilot)
                </Text>
                <Text style={[styles.opCardDesc, { color: theme.colors.textMuted }]}>
                  Doğal dille ERP sorgulama, hazır soru kalıpları & kısayollar
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.opActionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
              onPress={handleSyncOfflineCache}
              activeOpacity={0.8}
              disabled={isCaching}
            >
              <View style={[styles.opIconWrap, { backgroundColor: '#fef3c7' }]}>
                {isCaching ? (
                  <ActivityIndicator size="small" color="#d97706" />
                ) : (
                  <Ionicons name="cloud-download-outline" size={20} color="#d97706" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.opCardTitle, { color: theme.colors.text }]}>
                  Çevrimdışı Veri Paketi
                </Text>
                <Text style={[styles.opCardDesc, { color: theme.colors.textMuted }]}>
                  {isCaching
                    ? 'Veriler indiriliyor ve yerel önbelleğe alınıyor...'
                    : cacheMeta?.lastSyncAt
                    ? `${cacheMeta.productsCount} ürün, ${cacheMeta.contactsCount} cari önbellekte`
                    : 'Müşteri, ürün ve stokları çevrimdışı kullanım için indir'}
                </Text>
              </View>
              <Ionicons
                name={isCaching ? 'sync' : 'chevron-forward'}
                size={16}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Live Activity Stream (Phone) ── */}
        {!isTablet && (
          <ActivityStream
            activities={activities}
            onActivityPress={handleActivityPress}
            onViewAllPress={() => {
              navigation.navigate('SalesTab');
            }}
          />
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
            Axon Enterprise ERP • Tenant Portal
          </Text>
        </View>
      </ScrollView>

      {/* Floating AI ChatBot Assistant */}
      <ChatBot />

      {/* ── Global Spotlight Search Modal (FAZ 17) ── */}
      <SpotlightSearchModal
        visible={isSearchModalVisible}
        onClose={() => setIsSearchModalVisible(false)}
        onNavigateToEntity={(type, id, extra) => {
          setIsSearchModalVisible(false);
          if (type === 'contact') {
            navigation.navigate('SalesTab');
          } else if (type === 'product' || type === 'stock_movement') {
            navigation.navigate('InventoryTab');
          } else if (type === 'sales_order' || type === 'sales_quote') {
            navigation.navigate('SalesTab');
          } else if (type === 'purchase_order') {
            navigation.navigate('Procurement', { initialTab: 'ORDERS' });
          } else if (type === 'invoice' || type === 'payment') {
            navigation.navigate('Finance', { initialTab: 'payments' });
          } else if (type === 'service_request') {
            navigation.navigate('FieldService');
          } else if (type === 'work_order') {
            navigation.navigate('ProductionShopFloor');
          } else if (type === 'employee') {
            navigation.navigate('EmployeePortal', { initialTab: 'leaves' });
          } else if (extra?.module === 'inventory') {
            navigation.navigate('InventoryTab');
          } else {
            navigation.navigate('SalesTab');
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  companyName: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  dateTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 6,
    borderBottomWidth: 1,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 36,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  operationsSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  operationsGrid: {
    gap: 8,
  },
  opActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  opIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  opCardDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  spotlightTriggerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 10,
  },
  spotlightPlaceholder: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  spotlightShortcut: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  spotlightShortcutText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  analyticsCard: {
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  analyticsTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  analyticsIconBg: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  biTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  biTabBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  biTabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  biTabText: {
    fontSize: 11,
  },
  chartContainer: {
    width: '100%',
    paddingTop: 4,
  },
});
