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
import { KpiCard } from '../components/dashboard/KpiCard';
import { QuickActionsBar } from '../components/dashboard/QuickActionsBar';
import { ActivityStream } from '../components/dashboard/ActivityStream';
import { ChatBot } from '../components/ChatBot';
import { formatCurrency, initials } from '../lib/utils';
import {
  getMobileDashboard,
  MobileDashboardData,
  MobileDashboardActivity,
} from '../services/dashboard.service';
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

  const {
    unreadCount,
    loadNotifications,
    initializePushNotifications,
  } = useNotificationStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<MobileDashboardData | null>(null);

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

        {/* ── Executive Primary Card: Günlük Satış ── */}
        <KpiCard
          fullWidth
          title="Bugünkü Satış Cirosu"
          value={formatCurrency(sales?.todayGross ?? 0)}
          subtitle={`${sales?.todayCount ?? 0} Adet Satış Faturası Kesildi`}
          badge={{
            text: `${changeIsPositive ? '▲ +' : '▼ '}${sales?.changePercent ?? 0}% dünden`,
            variant: changeIsPositive ? 'success' : 'danger',
          }}
          icon="trending-up"
          iconColor={theme.colors.primary}
          iconBg={theme.colors.primaryMuted}
          progress={sales?.targetProgress ?? 0}
        />

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
          />

          {/* Vadesi Geçmiş Alacak */}
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
            navigation.navigate('SalesTab');
          }}
          onPendingApprovals={() => {
            navigation.navigate('ApprovalsTab');
          }}
          onStockCount={() => {
            dispatch(setMode('COUNT'));
            navigation.navigate('InventoryTab');
          }}
        />

        {/* ── Saha ve Üretim Operasyonları (FAZ 6) ── */}
        <View style={styles.operationsSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Saha ve Üretim Operasyonları
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
          </View>
        </View>

        {/* ── Live Activity Stream ── */}
        <ActivityStream
          activities={activities}
          onActivityPress={handleActivityPress}
          onViewAllPress={() => {
            navigation.navigate('SalesTab');
          }}
        />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
            Axon Enterprise ERP • Tenant Portal
          </Text>
        </View>
      </ScrollView>

      {/* Floating AI ChatBot Assistant */}
      <ChatBot />
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
});
