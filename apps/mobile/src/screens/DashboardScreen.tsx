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
import { useAuthStore } from '../store/auth.store';
import { StatCard } from '../components/StatCard';
import { SectionCard } from '../components/SectionCard';
import { ChatBot } from '../components/ChatBot';
import { Logo } from '../components/Logo';
import { formatCurrency, initials, formatDate } from '../lib/utils';
import {
  getRevenueSummary,
  getExpenseSummary,
  getStockSummary,
  getContactBalance,
  getRecentInvoices,
  getNotifications,
  type RevenueSummary,
  type StockSummary as StockSummaryType,
  type ContactBalance,
  type InvoiceItem,
  type NotificationItem,
} from '../services/dashboard.service';
import { logout as logoutService } from '../services/auth.service';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface DashboardData {
  revenue: RevenueSummary | null;
  expense: RevenueSummary | null;
  stock: StockSummaryType | null;
  balance: ContactBalance | null;
  invoices: InvoiceItem[];
  notifications: NotificationItem[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  DRAFT: '#64748B',
  SENT: '#3B82F6',
  PAID: '#10B981',
  PARTIALLY_PAID: '#F59E0B',
  OVERDUE: '#EF4444',
  CANCELLED: '#475569',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Taslak',
  SENT: 'Gönderildi',
  PAID: 'Ödendi',
  PARTIALLY_PAID: 'Kısmi',
  OVERDUE: 'Gecikmiş',
  CANCELLED: 'İptal',
};

// ─────────────────────────────────────────────
// Dashboard Screen
// ─────────────────────────────────────────────

export default function DashboardScreen() {
  const { user, tenant, logout: logoutStore } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData>({
    revenue: null,
    expense: null,
    stock: null,
    balance: null,
    invoices: [],
    notifications: [],
  });

  const now = new Date();
  const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    try {
      const [revenue, expense, stock, balance, invoices, notifications] = await Promise.allSettled([
        getRevenueSummary(dateFrom, dateTo),
        getExpenseSummary(dateFrom, dateTo),
        getStockSummary(),
        getContactBalance(),
        getRecentInvoices(5),
        getNotifications(5),
      ]);

      setData({
        revenue: revenue.status === 'fulfilled' ? revenue.value : null,
        expense: expense.status === 'fulfilled' ? expense.value : null,
        stock: stock.status === 'fulfilled' ? stock.value : null,
        balance: balance.status === 'fulfilled' ? balance.value : null,
        invoices: invoices.status === 'fulfilled' ? invoices.value : [],
        notifications: notifications.status === 'fulfilled' ? notifications.value : [],
      });
    } catch {
      // Hata sessizce yutulur, UI "—" gösterir
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleLogout = async () => {
    try {
      await logoutService();
    } catch {
      // Token zaten geçersiz olabilir, sessizce devam
    }
    logoutStore();
  };

  const profit = (data.revenue?.totalGross ?? 0) - (data.expense?.totalGross ?? 0);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Dashboard yükleniyor...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user?.name ?? 'A')}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.greeting} numberOfLines={1}>
              Merhaba, {user?.name?.split(' ')[0]}
            </Text>
            <View style={styles.companyRow}>
              <Ionicons name="business-outline" size={12} color="#94A3B8" />
              <Text style={styles.companyName} numberOfLines={1}>{tenant?.companyName}</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIcon} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#2563EB" />
        }
      >
        {/* Stat Cards — 2x2 Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statHalf}>
            <StatCard
              label="Bu Ay Gelir"
              value={formatCurrency(data.revenue?.totalGross ?? 0)}
              icon={<Ionicons name="trending-up" size={20} color="#10B981" />}
              iconBg="rgba(16,185,129,0.1)"
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Bu Ay Gider"
              value={formatCurrency(data.expense?.totalGross ?? 0)}
              icon={<Ionicons name="trending-down" size={20} color="#EF4444" />}
              iconBg="rgba(239,68,68,0.1)"
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Net Kar/Zarar"
              value={formatCurrency(profit)}
              icon={<Ionicons name="wallet-outline" size={20} color="#3B82F6" />}
              iconBg="rgba(59,130,246,0.1)"
              badge={
                profit >= 0
                  ? { text: '↑ Kârlı', color: '#10B981', bg: 'rgba(16,185,129,0.1)' }
                  : { text: '↓ Zararlı', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' }
              }
            />
          </View>
          <View style={styles.statHalf}>
            <StatCard
              label="Stok Değeri"
              value={formatCurrency(data.stock?.summary.totalStockValue ?? 0)}
              icon={<Ionicons name="cube-outline" size={20} color="#8B5CF6" />}
              iconBg="rgba(139,92,246,0.1)"
            />
          </View>
        </View>

        {/* Cari Bakiye Özeti */}
        <SectionCard
          icon={<Ionicons name="people-outline" size={16} color="#64748B" />}
          title="Cari Bakiye Özeti"
        >
          <View style={styles.balanceRow}>
            <View style={[styles.balanceBox, styles.receivableBox]}>
              <Text style={styles.balanceLabel}>ALACAK</Text>
              <Text style={[styles.balanceValue, { color: '#10B981' }]}>
                {formatCurrency(data.balance?.summary.totalReceivable ?? 0)}
              </Text>
            </View>
            <View style={[styles.balanceBox, styles.payableBox]}>
              <Text style={styles.balanceLabel}>BORÇ</Text>
              <Text style={[styles.balanceValue, { color: '#EF4444' }]}>
                {formatCurrency(data.balance?.summary.totalPayable ?? 0)}
              </Text>
            </View>
          </View>
        </SectionCard>

        {/* Son Faturalar */}
        <SectionCard
          icon={<Ionicons name="document-text-outline" size={16} color="#64748B" />}
          title="Son Faturalar"
        >
          {data.invoices.length > 0 ? (
            data.invoices.map((inv) => (
              <View key={inv.id} style={styles.invoiceRow}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[inv.status] ?? '#64748B' }]} />
                <View style={styles.invoiceInfo}>
                  <Text style={styles.invoiceNumber}>{inv.number}</Text>
                  <Text style={styles.invoiceContact} numberOfLines={1}>
                    {inv.contact?.name ?? '—'}
                  </Text>
                </View>
                <View style={styles.invoiceRight}>
                  <Text style={styles.invoiceAmount}>{formatCurrency(inv.totalGross)}</Text>
                  <Text style={styles.invoiceStatus}>{STATUS_LABEL[inv.status] ?? inv.status}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Fatura bulunamadı</Text>
            </View>
          )}
        </SectionCard>

        {/* Bildirimler */}
        <SectionCard
          icon={<Ionicons name="notifications-outline" size={16} color="#3B82F6" />}
          title="Bildirimler"
        >
          {data.notifications.length > 0 ? (
            data.notifications.map((n) => (
              <View key={n.id} style={styles.notifRow}>
                <View style={styles.notifDot} />
                <View style={styles.notifInfo}>
                  <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
                  {n.message && (
                    <Text style={styles.notifMsg} numberOfLines={1}>{n.message}</Text>
                  )}
                  <Text style={styles.notifDate}>{formatDate(n.createdAt)}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Bildirim yok</Text>
            </View>
          )}
        </SectionCard>

        {/* Kritik Stok Uyarısı */}
        {(data.stock?.summary.belowMinStockCount ?? 0) > 0 && (
          <SectionCard
            icon={<Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />}
            title="Kritik Stok Uyarıları"
          >
            {data.stock?.belowMinStock.slice(0, 5).map((item) => (
              <View key={item.productId} style={styles.stockRow}>
                <View style={styles.stockInfo}>
                  <Text style={styles.stockName} numberOfLines={1}>{item.productName}</Text>
                  <Text style={styles.stockWarehouse}>{item.warehouseName}</Text>
                </View>
                <View style={styles.stockRight}>
                  <Text style={styles.stockQty}>{item.quantity}</Text>
                  <Text style={styles.stockMin}>Min: {item.minStockLevel}</Text>
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Axon ERP © 2026</Text>
        </View>
      </ScrollView>

      {/* AI ChatBot — floating overlay */}
      <ChatBot />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
    backgroundColor: '#2563EB',
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
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  companyName: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statHalf: {
    width: '48%',
    flexGrow: 1,
  },

  // Balance
  balanceRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  balanceBox: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  receivableBox: {
    backgroundColor: 'rgba(16,185,129,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.1)',
  },
  payableBox: {
    backgroundColor: 'rgba(239,68,68,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.1)',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
  },

  // Invoices
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  invoiceInfo: {
    flex: 1,
    minWidth: 0,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  invoiceContact: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  invoiceRight: {
    alignItems: 'flex-end',
  },
  invoiceAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  invoiceStatus: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Notifications
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  notifDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
    marginTop: 6,
  },
  notifInfo: {
    flex: 1,
    minWidth: 0,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  notifMsg: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  notifDate: {
    fontSize: 10,
    color: '#CBD5E1',
    marginTop: 4,
  },

  // Stock Alerts
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  stockInfo: {
    flex: 1,
    minWidth: 0,
  },
  stockName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  stockWarehouse: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  stockRight: {
    alignItems: 'flex-end',
  },
  stockQty: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F59E0B',
  },
  stockMin: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Empty
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 13,
    color: '#CBD5E1',
    fontWeight: '500',
  },
});
