import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Share,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import {
  OverdueInvoice,
  AgingSummary,
  PaymentRecord,
  EDocument,
  getOverdueReceivables,
  getPayments,
  getEDocuments,
  getCashAccounts,
  getBankAccounts,
  BankAccount,
  CashAccount,
  CheckPromissoryNote,
  CheckNoteType,
  CheckStatus,
  getCheckPromissoryNotes,
  updateCheckPromissoryStatus,
  deleteCheckPromissoryNote,
  ExpenseRecord,
  ExpenseStatus,
  getExpenses,
  updateExpenseStatus,
} from '../services/finance.service';
import {
  OverdueInvoiceCard,
  PaymentReceiptModal,
  EDocumentPreviewModal,
  CheckNoteCard,
  CheckDetailModal,
  CreateCheckModal,
  ExpenseCard,
  CreateExpenseModal,
  BankAccountCard,
  BankStatementModal,
} from '../components/finance';
import { PreciousPaperCard, DualPaneBankStatement } from '../features/finance';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { Badge } from '../components/common/Badge';
import { OptimizedFlatList } from '../components/common';
import { useScreenCaptureProtection } from '../hooks';

export type FinanceTab =
  | 'overdue'
  | 'payments'
  | 'checks'
  | 'expenses'
  | 'treasury'
  | 'edocuments';

interface Props {
  navigation: any;
  route?: {
    params?: {
      initialTab?: FinanceTab;
      contactId?: string;
    };
  };
}

export default function FinanceScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { isTablet } = useResponsive();

  // Screen capture & recording protection for financial data
  useScreenCaptureProtection({ enabled: true, screenName: 'FinanceScreen' });

  const [activeTab, setActiveTab] = useState<FinanceTab>(
    route?.params?.initialTab || 'overdue',
  );

  // Tab 1: Overdue Invoices & Aging
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [agingSummary, setAgingSummary] = useState<AgingSummary | null>(null);

  // Tab 2: Payments (Tahsilatlar)
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Tab 3: Çek & Senet Portföyü (FAZ 14.1)
  const [checkNotes, setCheckNotes] = useState<CheckPromissoryNote[]>([]);
  const [checkTypeFilter, setCheckTypeFilter] = useState<'ALL' | 'CHECK' | 'PROMISSORY_NOTE'>('ALL');
  const [checkStatusFilter, setCheckStatusFilter] = useState<'ALL' | CheckStatus>('ALL');

  // Tab 4: Saha Masraf & Harcırah (FAZ 14.2)
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<'ALL' | ExpenseStatus>('ALL');

  // Tab 5: Kasa & Banka (FAZ 14.3)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [treasuryType, setTreasuryType] = useState<'BANK' | 'CASH'>('BANK');

  // Tab 6: E-Documents
  const [eDocuments, setEDocuments] = useState<EDocument[]>([]);
  const [eDocTypeFilter, setEDocTypeFilter] = useState<'ALL' | 'E_INVOICE' | 'E_ARCHIVE' | 'E_WAYBILL'>('ALL');

  // Loading & Filter States
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<OverdueInvoice | null>(null);

  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const [selectedInvoiceForPreview, setSelectedInvoiceForPreview] = useState<OverdueInvoice | null>(null);
  const [selectedDocForPreview, setSelectedDocForPreview] = useState<EDocument | null>(null);

  const [isCreateCheckModalVisible, setIsCreateCheckModalVisible] = useState(false);
  const [selectedCheckForDetail, setSelectedCheckForDetail] = useState<CheckPromissoryNote | null>(null);
  const [isCheckDetailModalVisible, setIsCheckDetailModalVisible] = useState(false);

  const [isCreateExpenseModalVisible, setIsCreateExpenseModalVisible] = useState(false);

  const [selectedAccountForStatement, setSelectedAccountForStatement] = useState<
    BankAccount | CashAccount | null
  >(null);
  const [isBankStatementModalVisible, setIsBankStatementModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'overdue') {
        const res = await getOverdueReceivables({
          contactId: route?.params?.contactId,
        });
        setOverdueInvoices(res.overdueInvoices);
        setAgingSummary(res.agingSummary);
      } else if (activeTab === 'payments') {
        const res = await getPayments({
          contactId: route?.params?.contactId,
          limit: 50,
        });
        setPayments(res.payments);
      } else if (activeTab === 'checks') {
        const res = await getCheckPromissoryNotes({
          type: checkTypeFilter === 'ALL' ? undefined : (checkTypeFilter as CheckNoteType),
          status: checkStatusFilter === 'ALL' ? undefined : checkStatusFilter,
          contactId: route?.params?.contactId,
        });
        setCheckNotes(res.items);
      } else if (activeTab === 'expenses') {
        const list = await getExpenses({
          status: expenseStatusFilter === 'ALL' ? undefined : expenseStatusFilter,
        });
        setExpenses(list);
      } else if (activeTab === 'treasury') {
        const [banks, cashes] = await Promise.all([
          getBankAccounts(),
          getCashAccounts(),
        ]);
        setBankAccounts(banks);
        setCashAccounts(cashes);
      } else if (activeTab === 'edocuments') {
        const res = await getEDocuments({ limit: 50 });
        setEDocuments(res.documents);
      }
    } catch (err) {
      console.warn('[FinanceScreen] Load error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    activeTab,
    route?.params?.contactId,
    checkTypeFilter,
    checkStatusFilter,
    expenseStatusFilter,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleTabChange = (tab: FinanceTab) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveTab(tab);
    setSearchQuery('');
  };

  const formatCurrency = (val?: number | null): string => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  // ─────────────────────────────────────────────
  // Filtered Lists
  // ─────────────────────────────────────────────

  const filteredOverdue = useMemo(() => {
    if (!searchQuery.trim()) return overdueInvoices;
    const q = searchQuery.toLowerCase();
    return overdueInvoices.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        inv.contact?.name.toLowerCase().includes(q),
    );
  }, [overdueInvoices, searchQuery]);

  const filteredPayments = useMemo(() => {
    if (!searchQuery.trim()) return payments;
    const q = searchQuery.toLowerCase();
    return payments.filter(
      (p) =>
        p.reference?.toLowerCase().includes(q) ||
        p.contact?.name.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q),
    );
  }, [payments, searchQuery]);

  const filteredChecks = useMemo(() => {
    return checkNotes.filter((c) => {
      const matchType =
        checkTypeFilter === 'ALL' || c.type === checkTypeFilter;
      const matchStatus =
        checkStatusFilter === 'ALL' || c.status === checkStatusFilter;
      if (!matchType || !matchStatus) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.number.toLowerCase().includes(q) ||
        (c.bankName && c.bankName.toLowerCase().includes(q)) ||
        (c.contact?.name && c.contact.name.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    });
  }, [checkNotes, checkTypeFilter, checkStatusFilter, searchQuery]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchStatus =
        expenseStatusFilter === 'ALL' || e.status === expenseStatusFilter;
      if (!matchStatus) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [expenses, expenseStatusFilter, searchQuery]);

  const filteredBankAccounts = useMemo(() => {
    if (!searchQuery.trim()) return bankAccounts;
    const q = searchQuery.toLowerCase();
    return bankAccounts.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.bankName && b.bankName.toLowerCase().includes(q)) ||
        (b.iban && b.iban.toLowerCase().includes(q)),
    );
  }, [bankAccounts, searchQuery]);

  const filteredCashAccounts = useMemo(() => {
    if (!searchQuery.trim()) return cashAccounts;
    const q = searchQuery.toLowerCase();
    return cashAccounts.filter((c) => c.name.toLowerCase().includes(q));
  }, [cashAccounts, searchQuery]);

  const filteredEDocuments = useMemo(() => {
    return eDocuments.filter((doc) => {
      const matchType = eDocTypeFilter === 'ALL' || doc.type === eDocTypeFilter;
      if (!matchType) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const num = doc.invoice?.number || doc.deliveryNote?.number || '';
      return num.toLowerCase().includes(q) || (doc.uuid && doc.uuid.toLowerCase().includes(q));
    });
  }, [eDocuments, eDocTypeFilter, searchQuery]);

  // Check Portfolio Metrics
  const checkPortfolioMetrics = useMemo(() => {
    const totalAmount = filteredChecks.reduce((acc, c) => acc + c.amount, 0);
    const pendingCount = filteredChecks.filter((c) => c.status === 'PENDING').length;
    const depositedCount = filteredChecks.filter((c) => c.status === 'DEPOSITED').length;
    const clearedCount = filteredChecks.filter((c) => c.status === 'CLEARED').length;
    const bouncedCount = filteredChecks.filter((c) => c.status === 'BOUNCED').length;

    return { totalAmount, pendingCount, depositedCount, clearedCount, bouncedCount };
  }, [filteredChecks]);

  // Expenses Metrics
  const expenseMetrics = useMemo(() => {
    const totalAmount = filteredExpenses.reduce((acc, e) => acc + e.totalAmount, 0);
    const totalTax = filteredExpenses.reduce((acc, e) => acc + e.taxAmount, 0);
    const pendingCount = filteredExpenses.filter((e) => e.status === 'PENDING_APPROVAL').length;
    return { totalAmount, totalTax, pendingCount };
  }, [filteredExpenses]);

  // Check Status Change Handler
  const handleQuickCheckStatus = async (item: CheckPromissoryNote, nextStatus: CheckStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const labelMap: Record<CheckStatus, string> = {
      PENDING: 'Portföyde (Bekliyor)',
      DEPOSITED: 'Tahsile Verildi',
      CLEARED: 'Tahsil Edildi',
      BOUNCED: 'Karşılıksız',
      CANCELLED: 'İptal / İade',
    };

    Alert.alert(
      'Çek/Senet Durum Güncellemesi',
      `Evrak No: ${item.number}\n\nDurum "${labelMap[nextStatus]}" olarak güncellensin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Güncelle',
          onPress: async () => {
            try {
              await updateCheckPromissoryStatus(item.id, nextStatus);
              loadData();
            } catch (err: any) {
              Alert.alert('Hata', err.message || 'Durum güncellenemedi.');
            }
          },
        },
      ],
    );
  };

  // Expense Approval / Rejection
  const handleExpenseAction = async (item: ExpenseRecord, newStatus: ExpenseStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await updateExpenseStatus(item.id, newStatus);
      loadData();
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Masraf durumu güncellenemedi.');
    }
  };

  // Check Delete
  const handleCheckDelete = async (id: string) => {
    try {
      await deleteCheckPromissoryNote(id);
      setIsCheckDetailModalVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Evrak silinemedi.');
    }
  };

  const getMethodBadge = (m: string) => {
    switch (m) {
      case 'CASH':
        return { label: 'Nakit', variant: 'success' as const };
      case 'CREDIT_CARD':
        return { label: 'Kredi Kartı', variant: 'info' as const };
      case 'BANK_TRANSFER':
        return { label: 'Havale/EFT', variant: 'primary' as const };
      case 'CHECK':
        return { label: 'Çek', variant: 'warning' as const };
      default:
        return { label: m, variant: 'neutral' as const };
    }
  };

  const handleSharePaymentReceipt = (p: PaymentRecord) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const dateStr = new Date(p.date).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const shareText =
      `🧾 AXON ERP TAHSİLAT MAKBUZU\n\n` +
      `Müşteri: ${p.contact?.name || 'Cari'}\n` +
      `Tutar: ${formatCurrency(p.amount)}\n` +
      `Yöntem: ${p.method}\n` +
      `Ref / Makbuz No: ${p.reference || '-'}\n` +
      `Tarih: ${dateStr}\n\n` +
      `Axon ERP Finans Yönetimi`;

    Share.share({ message: shareText }).catch(() => {});
  };

  // Dynamic Header Subtitle
  const getHeaderSubtitle = () => {
    switch (activeTab) {
      case 'overdue':
        return 'Vadesi Geçen Alacaklar & Yaşlandırma';
      case 'payments':
        return 'Saha Tahsilat Makbuzları & Makbuz Paylaşımı';
      case 'checks':
        return 'Çek & Senet Portföyü, Vade & Tahsil Takibi';
      case 'expenses':
        return 'Saha Masraf & Harcırah Fişleri';
      case 'treasury':
        return 'Kasa & Banka Bakiyeleri, Son 30 Gün Ekstresi';
      case 'edocuments':
        return 'E-Fatura, E-Arşiv & E-İrsaliye Önizleme';
      default:
        return 'Finans & Hazine Yönetimi';
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Screen Header */}
      <View style={[styles.screenHeader, { borderBottomColor: theme.colors.borderSubtle }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Finans & Hazine Merkezi</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {getHeaderSubtitle()}
          </Text>
        </View>

        {/* Quick Header CTA */}
        {activeTab === 'checks' && (
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => setIsCreateCheckModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={styles.headerActionBtnText}>Çek Ekle</Text>
          </TouchableOpacity>
        )}

        {activeTab === 'expenses' && (
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: '#10b981' }]}
            onPress={() => setIsCreateExpenseModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={16} color="#ffffff" />
            <Text style={styles.headerActionBtnText}>Fiş Gir</Text>
          </TouchableOpacity>
        )}

        {activeTab === 'payments' && (
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => {
              setSelectedInvoiceForPayment(null);
              setIsPaymentModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={styles.headerActionBtnText}>Tahsilat</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.refreshIconBtn, { backgroundColor: theme.colors.surfaceCard }]}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="reload" size={18} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Segmented Horizontal Tab Navigation (6 Tabs) */}
      <View style={[styles.tabBarWrapper, { borderBottomColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceCard }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'overdue' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }],
            ]}
            onPress={() => handleTabChange('overdue')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={activeTab === 'overdue' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'overdue' ? theme.colors.primary : theme.colors.textMuted },
              ]}
            >
              Vadesi Geçenler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'payments' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }],
            ]}
            onPress={() => handleTabChange('payments')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="wallet-outline"
              size={16}
              color={activeTab === 'payments' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'payments' ? theme.colors.primary : theme.colors.textMuted },
              ]}
            >
              Tahsilatlar
            </Text>
          </TouchableOpacity>

          {/* FAZ 14.1: Çek & Senet */}
          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'checks' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }],
            ]}
            onPress={() => handleTabChange('checks')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="card-outline"
              size={16}
              color={activeTab === 'checks' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'checks' ? theme.colors.primary : theme.colors.textMuted },
              ]}
            >
              Çek & Senet
            </Text>
          </TouchableOpacity>

          {/* FAZ 14.2: Saha Masraf & Harcırah */}
          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'expenses' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }],
            ]}
            onPress={() => handleTabChange('expenses')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="receipt-outline"
              size={16}
              color={activeTab === 'expenses' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'expenses' ? theme.colors.primary : theme.colors.textMuted },
              ]}
            >
              Masraflar
            </Text>
          </TouchableOpacity>

          {/* FAZ 14.3: Kasa & Banka */}
          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'treasury' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }],
            ]}
            onPress={() => handleTabChange('treasury')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="business-outline"
              size={16}
              color={activeTab === 'treasury' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'treasury' ? theme.colors.primary : theme.colors.textMuted },
              ]}
            >
              Kasa & Banka
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'edocuments' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }],
            ]}
            onPress={() => handleTabChange('edocuments')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color={activeTab === 'edocuments' ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'edocuments' ? theme.colors.primary : theme.colors.textMuted },
              ]}
            >
              E-Belgeler
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Search Input Bar */}
      <View style={[styles.searchWrap, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder={
              activeTab === 'overdue'
                ? 'Fatura no veya cari ara...'
                : activeTab === 'payments'
                ? 'Makbuz no veya cari ara...'
                : activeTab === 'checks'
                ? 'Evrak no, banka veya cari ara...'
                : activeTab === 'expenses'
                ? 'Masraf açıklaması veya kategori ara...'
                : activeTab === 'treasury'
                ? 'Hesap adı veya IBAN ara...'
                : 'Belge no veya ETTN ara...'
            }
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: Vadesi Geçen Alacak Takibi (FAZ 7.1)                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'overdue' && (
        <OptimizedFlatList<OverdueInvoice>
          data={filteredOverdue}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            agingSummary ? (
              <View style={styles.agingSection}>
                {/* Total Overdue Banner */}
                <View style={[styles.agingHero, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                  <View style={styles.agingHeroLeft}>
                    <Text style={styles.agingHeroLabel}>Toplam Vadesi Geçen Alacak</Text>
                    <Text style={styles.agingHeroAmount}>{formatCurrency(agingSummary.totalOverdue)}</Text>
                  </View>
                  <Badge label={`${agingSummary.totalCount} FATURA`} variant="danger" />
                </View>

                {/* Aging Brackets (Yaşlandırma) */}
                <View style={styles.agingGrid}>
                  <View style={[styles.agingPill, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
                    <Text style={[styles.agingPillTitle, { color: theme.colors.textMuted }]}>1 - 30 Gün</Text>
                    <Text style={[styles.agingPillVal, { color: theme.colors.text }]}>
                      {formatCurrency(agingSummary.bracket1_30)}
                    </Text>
                  </View>
                  <View style={[styles.agingPill, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
                    <Text style={[styles.agingPillTitle, { color: theme.colors.textMuted }]}>31 - 60 Gün</Text>
                    <Text style={[styles.agingPillVal, { color: '#f59e0b' }]}>
                      {formatCurrency(agingSummary.bracket31_60)}
                    </Text>
                  </View>
                  <View style={[styles.agingPill, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
                    <Text style={[styles.agingPillTitle, { color: theme.colors.textMuted }]}>61 - 90 Gün</Text>
                    <Text style={[styles.agingPillVal, { color: '#ea580c' }]}>
                      {formatCurrency(agingSummary.bracket61_90)}
                    </Text>
                  </View>
                  <View style={[styles.agingPill, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
                    <Text style={[styles.agingPillTitle, { color: theme.colors.textMuted }]}>90+ Gün</Text>
                    <Text style={[styles.agingPillVal, { color: '#dc2626' }]}>
                      {formatCurrency(agingSummary.bracket90Plus)}
                    </Text>
                  </View>
                </View>

                <View style={styles.listHeaderDivider}>
                  <Text style={[styles.listHeaderTitle, { color: theme.colors.text }]}>
                    Açık Faturalar ({filteredOverdue.length})
                  </Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <OverdueInvoiceCard
              invoice={item}
              onPreview={(inv) => {
                setSelectedInvoiceForPreview(inv);
                setSelectedDocForPreview(null);
                setIsPreviewModalVisible(true);
              }}
              onCollect={(inv) => {
                setSelectedInvoiceForPayment(inv);
                setIsPaymentModalVisible(true);
              }}
            />
          )}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="checkmark-circle-outline" size={56} color="#10b981" />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Tebrikler!</Text>
                <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                  Şu an vadesi geçmiş herhangi bir fatura bulunmuyor.
                </Text>
              </View>
            )
          }
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: Sahada Tahsilat Makbuzları (FAZ 7.2)                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'payments' && (
        <OptimizedFlatList<PaymentRecord>
          data={filteredPayments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.paymentsHeader}>
              <TouchableOpacity
                style={[styles.newReceiptBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => {
                  setSelectedInvoiceForPayment(null);
                  setIsPaymentModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={20} color="#ffffff" />
                <Text style={styles.newReceiptBtnText}>Yeni Tahsilat Makbuzu Kes</Text>
              </TouchableOpacity>

              <Text style={[styles.listHeaderTitle, { color: theme.colors.text, marginTop: 16 }]}>
                Son Tahsilatlar ({filteredPayments.length})
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const badgeInfo = getMethodBadge(item.method);
            return (
              <View
                style={[
                  styles.paymentCard,
                  { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
                ]}
              >
                <View style={styles.paymentCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paymentContactName, { color: theme.colors.text }]}>
                      {item.contact?.name || 'Genel Cari'}
                    </Text>
                    <Text style={[styles.paymentMeta, { color: theme.colors.textMuted }]}>
                      {new Date(item.date).toLocaleDateString('tr-TR')} • Ref: {item.reference || '-'}
                    </Text>
                  </View>
                  <Text style={[styles.paymentAmount, { color: theme.colors.primary }]}>
                    {formatCurrency(item.amount)}
                  </Text>
                </View>

                <View style={styles.paymentCardFooter}>
                  <Badge label={badgeInfo.label} variant={badgeInfo.variant} />
                  {item.bankAccount?.name && (
                    <Text style={[styles.accountLabel, { color: theme.colors.textMuted }]}>
                      {item.bankAccount.name}
                    </Text>
                  )}
                  {item.cashAccount?.name && (
                    <Text style={[styles.accountLabel, { color: theme.colors.textMuted }]}>
                      {item.cashAccount.name}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={styles.shareIconBtn}
                    onPress={() => handleSharePaymentReceipt(item)}
                  >
                    <Ionicons name="share-outline" size={16} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="wallet-outline" size={56} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Tahsilat Bulunamadı</Text>
                <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                  Henüz kaydedilmiş tahsilat makbuzu yok.
                </Text>
              </View>
            )
          }
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: Çek & Senet Portföy Yönetimi (FAZ 14.1)               */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'checks' && (
        <OptimizedFlatList<CheckPromissoryNote>
          data={filteredChecks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.checksHeader}>
              {/* Type Filter Pills */}
              <View style={styles.filterPillRow}>
                {(['ALL', 'CHECK', 'PROMISSORY_NOTE'] as const).map((t) => {
                  const isSel = checkTypeFilter === t;
                  const label = t === 'ALL' ? 'Tümü' : t === 'CHECK' ? 'Çekler' : 'Senetler';
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: isSel ? theme.colors.primary : theme.colors.surfaceCard,
                          borderColor: isSel ? theme.colors.primary : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setCheckTypeFilter(t);
                      }}
                    >
                      <Text style={[styles.filterPillText, { color: isSel ? '#ffffff' : theme.colors.text }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Status Filter Horizontal Scroll */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusFilterScroll}>
                {(['ALL', 'PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED'] as const).map((st) => {
                  const isSel = checkStatusFilter === st;
                  const labelMap: Record<string, string> = {
                    ALL: 'Tüm Durumlar',
                    PENDING: 'Beklemede',
                    DEPOSITED: 'Tahsilde',
                    CLEARED: 'Tahsil Edildi',
                    BOUNCED: 'Karşılıksız',
                  };
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.statusChip,
                        {
                          backgroundColor: isSel ? theme.colors.primary + '18' : theme.colors.surfaceCard,
                          borderColor: isSel ? theme.colors.primary : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setCheckStatusFilter(st);
                      }}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          { color: isSel ? theme.colors.primary : theme.colors.textMuted },
                        ]}
                      >
                        {labelMap[st]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Portfolio Metrics Hero Banner */}
              <View style={[styles.portfolioHero, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                <View style={styles.portfolioHeroRow}>
                  <View>
                    <Text style={styles.portfolioHeroLabel}>Portföydeki Çek/Senet Tutarı</Text>
                    <Text style={styles.portfolioHeroAmount}>
                      {formatCurrency(checkPortfolioMetrics.totalAmount)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.heroActionBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={() => setIsCreateCheckModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle" size={16} color="#ffffff" />
                    <Text style={styles.heroActionBtnText}>Yeni Evrak</Text>
                  </TouchableOpacity>
                </View>

                {/* Sub Counter Chips */}
                <View style={styles.portfolioMiniGrid}>
                  <View style={styles.portfolioMiniItem}>
                    <Text style={styles.miniItemVal}>{checkPortfolioMetrics.pendingCount}</Text>
                    <Text style={styles.miniItemLbl}>Bekleyen</Text>
                  </View>
                  <View style={styles.portfolioMiniItem}>
                    <Text style={[styles.miniItemVal, { color: '#2563eb' }]}>
                      {checkPortfolioMetrics.depositedCount}
                    </Text>
                    <Text style={styles.miniItemLbl}>Tahsilde</Text>
                  </View>
                  <View style={styles.portfolioMiniItem}>
                    <Text style={[styles.miniItemVal, { color: '#10b981' }]}>
                      {checkPortfolioMetrics.clearedCount}
                    </Text>
                    <Text style={styles.miniItemLbl}>Tahsil</Text>
                  </View>
                  <View style={styles.portfolioMiniItem}>
                    <Text style={[styles.miniItemVal, { color: '#ef4444' }]}>
                      {checkPortfolioMetrics.bouncedCount}
                    </Text>
                    <Text style={styles.miniItemLbl}>Karşılıksız</Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.listHeaderTitle, { color: theme.colors.text, marginTop: 14 }]}>
                Portföy Evrakları ({filteredChecks.length})
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <PreciousPaperCard
              item={item}
              onPress={(selected) => {
                setSelectedCheckForDetail(selected);
                setIsCheckDetailModalVisible(true);
              }}
              onCollect={(selected) => handleQuickCheckStatus(selected, 'CLEARED')}
              onBounce={(selected) => handleQuickCheckStatus(selected, 'BOUNCED')}
              onEndorse={(selected) => handleQuickCheckStatus(selected, 'DEPOSITED')}
            />
          )}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="card-outline" size={56} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Evrak Bulunamadı</Text>
                <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                  Kriterlere uygun kayıtlı çek veya senet bulunmuyor.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCtaBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => setIsCreateCheckModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle" size={18} color="#ffffff" />
                  <Text style={styles.emptyCtaBtnText}>Yeni Çek / Senet Girişi</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 4: Saha Masraf & Harcırah Girişi (FAZ 14.2)             */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <OptimizedFlatList<ExpenseRecord>
          data={filteredExpenses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.expensesHeader}>
              {/* Status Filter Scroll */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusFilterScroll}>
                {(['ALL', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REIMBURSED'] as const).map((st) => {
                  const isSel = expenseStatusFilter === st;
                  const labelMap: Record<string, string> = {
                    ALL: 'Tümü',
                    PENDING_APPROVAL: 'Onay Bekleyen',
                    APPROVED: 'Onaylandı',
                    REJECTED: 'Reddedildi',
                    REIMBURSED: 'Ödendi',
                  };
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.statusChip,
                        {
                          backgroundColor: isSel ? '#10b98118' : theme.colors.surfaceCard,
                          borderColor: isSel ? '#10b981' : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setExpenseStatusFilter(st);
                      }}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          { color: isSel ? '#10b981' : theme.colors.textMuted },
                        ]}
                      >
                        {labelMap[st]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Expense Metrics Hero */}
              <View style={[styles.expenseHero, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
                <View style={styles.expenseHeroRow}>
                  <View>
                    <Text style={styles.expenseHeroLabel}>Toplam Masraf Tutarı (KDV Dahil)</Text>
                    <Text style={styles.expenseHeroAmount}>
                      {formatCurrency(expenseMetrics.totalAmount)}
                    </Text>
                    <Text style={styles.expenseHeroSub}>
                      KDV Toplamı: {formatCurrency(expenseMetrics.totalTax)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.heroActionBtn, { backgroundColor: '#10b981' }]}
                    onPress={() => setIsCreateExpenseModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={16} color="#ffffff" />
                    <Text style={styles.heroActionBtnText}>Fiş Ekle</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.listHeaderTitle, { color: theme.colors.text, marginTop: 14 }]}>
                Kayıtlı Masraf Fişleri ({filteredExpenses.length})
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ExpenseCard
              item={item}
              onApprove={(exp) => handleExpenseAction(exp, 'APPROVED')}
              onReject={(exp) => handleExpenseAction(exp, 'REJECTED')}
            />
          )}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="receipt-outline" size={56} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Masraf Kaydı Yok</Text>
                <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                  Henüz kaydedilmiş masraf fişi veya harcırah bulunmuyor.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCtaBtn, { backgroundColor: '#10b981' }]}
                  onPress={() => setIsCreateExpenseModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={18} color="#ffffff" />
                  <Text style={styles.emptyCtaBtnText}>Yeni Masraf / Fiş Gir</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 5: Kasa & Banka Yönetimi & Ekstreler (FAZ 14.3)          */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'treasury' && (
        <View style={{ flex: 1 }}>
          {/* Treasury Type Selector (Banka / Kasa) */}
          <View style={styles.treasuryToggleRow}>
            <TouchableOpacity
              style={[
                styles.treasuryToggleBtn,
                treasuryType === 'BANK' && [
                  styles.treasuryToggleBtnActive,
                  { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                ],
                { backgroundColor: treasuryType === 'BANK' ? theme.colors.primary : theme.colors.surfaceCard },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTreasuryType('BANK');
              }}
            >
              <Ionicons
                name="business"
                size={16}
                color={treasuryType === 'BANK' ? '#ffffff' : theme.colors.textMuted}
              />
              <Text
                style={[
                  styles.treasuryToggleText,
                  { color: treasuryType === 'BANK' ? '#ffffff' : theme.colors.text },
                ]}
              >
                Banka Hesapları ({bankAccounts.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.treasuryToggleBtn,
                treasuryType === 'CASH' && [
                  styles.treasuryToggleBtnActive,
                  { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                ],
                { backgroundColor: treasuryType === 'CASH' ? theme.colors.primary : theme.colors.surfaceCard },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTreasuryType('CASH');
              }}
            >
              <Ionicons
                name="wallet"
                size={16}
                color={treasuryType === 'CASH' ? '#ffffff' : theme.colors.textMuted}
              />
              <Text
                style={[
                  styles.treasuryToggleText,
                  { color: treasuryType === 'CASH' ? '#ffffff' : theme.colors.text },
                ]}
              >
                Nakit Kasalar ({cashAccounts.length})
              </Text>
            </TouchableOpacity>
          </View>

          {treasuryType === 'BANK' ? (
            isTablet ? (
              <View style={styles.tabletDualPaneWrap}>
                <DualPaneBankStatement
                  accounts={filteredBankAccounts}
                  selectedAccountId={selectedAccountForStatement?.id}
                  onSelectAccount={(acc) => setSelectedAccountForStatement(acc)}
                />
              </View>
            ) : (
              <OptimizedFlatList<BankAccount>
                data={filteredBankAccounts}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
                renderItem={({ item }) => (
                  <BankAccountCard
                    account={item}
                    isCash={false}
                    onPress={(acc) => {
                      setSelectedAccountForStatement(acc);
                      setIsBankStatementModalVisible(true);
                    }}
                  />
                )}
                ListEmptyComponent={
                  isLoading ? (
                    <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
                  ) : (
                    <View style={styles.emptyWrap}>
                      <Ionicons name="business-outline" size={56} color={theme.colors.textMuted} />
                      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Banka Hesabı Yok</Text>
                      <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                        Sistemde tanımlı aktif banka hesabı bulunamadı.
                      </Text>
                    </View>
                  )
                }
              />
            )
          ) : (
            <OptimizedFlatList<CashAccount>
              data={filteredCashAccounts}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
              renderItem={({ item }) => (
                <BankAccountCard
                  account={item}
                  isCash={true}
                  onPress={(acc) => {
                    setSelectedAccountForStatement(acc);
                    setIsBankStatementModalVisible(true);
                  }}
                />
              )}
              ListEmptyComponent={
                isLoading ? (
                  <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
                ) : (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="wallet-outline" size={56} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Kasa Tanımı Yok</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                      Sistemde tanımlı nakit kasa hesabı bulunamadı.
                    </Text>
                  </View>
                )
              }
            />
          )}
        </View>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 6: E-Belge & Fatura Önizleme (FAZ 7.3)                    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'edocuments' && (
        <OptimizedFlatList<EDocument>
          data={filteredEDocuments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.edocFilterRow}>
              {(['ALL', 'E_INVOICE', 'E_ARCHIVE', 'E_WAYBILL'] as const).map((t) => {
                const isSel = eDocTypeFilter === t;
                const label =
                  t === 'ALL'
                    ? 'Tümü'
                    : t === 'E_INVOICE'
                    ? 'E-Fatura'
                    : t === 'E_ARCHIVE'
                    ? 'E-Arşiv'
                    : 'E-İrsaliye';
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.edocFilterPill,
                      {
                        backgroundColor: isSel ? theme.colors.primary : theme.colors.surfaceCard,
                        borderColor: isSel ? theme.colors.primary : theme.colors.borderSubtle,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setEDocTypeFilter(t);
                    }}
                  >
                    <Text style={[styles.edocFilterText, { color: isSel ? '#ffffff' : theme.colors.text }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          }
          renderItem={({ item }) => {
            const num = item.invoice?.number || item.deliveryNote?.number || 'Belge No Yok';
            const typeLabel =
              item.type === 'E_INVOICE'
                ? 'E-FATURA'
                : item.type === 'E_WAYBILL'
                ? 'E-İRSALİYE'
                : 'E-ARŞİV';

            return (
              <TouchableOpacity
                style={[
                  styles.edocCard,
                  { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
                ]}
                onPress={() => {
                  setSelectedDocForPreview(item);
                  setSelectedInvoiceForPreview(null);
                  setIsPreviewModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.edocCardTop}>
                  <View style={styles.edocIdentity}>
                    <Ionicons name="document-text" size={20} color="#2563eb" />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={[styles.edocNumber, { color: theme.colors.text }]}>{num}</Text>
                      <Text style={[styles.edocType, { color: theme.colors.textMuted }]}>{typeLabel}</Text>
                    </View>
                  </View>
                  <Badge
                    label={item.status === 'ACCEPTED' ? 'GİB ONAYLI' : item.status}
                    variant={item.status === 'ACCEPTED' ? 'success' : 'info'}
                  />
                </View>

                {item.uuid && (
                  <Text style={[styles.edocUuid, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    ETTN: {item.uuid}
                  </Text>
                )}

                <View style={styles.edocCardBottom}>
                  <Text style={[styles.edocDate, { color: theme.colors.textMuted }]}>
                    {new Date(item.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                  <View style={styles.edocViewAction}>
                    <Text style={[styles.edocViewText, { color: theme.colors.primary }]}>Önizle</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="document-outline" size={56} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>E-Belge Bulunamadı</Text>
                <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                  Kriterlere uygun kayıtlı elektronik belge yok.
                </Text>
              </View>
            )
          }
        />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ALL MODALS                                                    */}
      {/* ───────────────────────────────────────────────────────────── */}

      {/* Payment Receipt Modal (Makbuz Girişi) */}
      <PaymentReceiptModal
        visible={isPaymentModalVisible}
        onClose={() => setIsPaymentModalVisible(false)}
        onSuccess={() => {
          loadData();
        }}
        initialInvoice={selectedInvoiceForPayment}
      />

      {/* E-Document Preview Modal (PDF / E-Belge Önizleme) */}
      <EDocumentPreviewModal
        visible={isPreviewModalVisible}
        onClose={() => setIsPreviewModalVisible(false)}
        invoiceId={selectedInvoiceForPreview?.id}
        documentId={selectedDocForPreview?.id}
        initialInvoice={selectedInvoiceForPreview}
        initialEDocument={selectedDocForPreview}
      />

      {/* FAZ 14.1: Yeni Çek/Senet Ekleme Modalı */}
      <CreateCheckModal
        visible={isCreateCheckModalVisible}
        onClose={() => setIsCreateCheckModalVisible(false)}
        onSuccess={() => {
          loadData();
        }}
        initialContactId={route?.params?.contactId}
      />

      {/* FAZ 14.1: Çek/Senet Detay & Fotoğraf & Durum Modalı */}
      <CheckDetailModal
        visible={isCheckDetailModalVisible}
        item={selectedCheckForDetail}
        onClose={() => {
          setIsCheckDetailModalVisible(false);
          setSelectedCheckForDetail(null);
        }}
        onStatusUpdated={(_updated) => {
          setIsCheckDetailModalVisible(false);
          setSelectedCheckForDetail(null);
          loadData();
        }}
        onDeleted={(_id) => {
          setIsCheckDetailModalVisible(false);
          setSelectedCheckForDetail(null);
          loadData();
        }}
      />

      {/* FAZ 14.2: Yeni Masraf & Harcırah Fişi Modalı */}
      <CreateExpenseModal
        visible={isCreateExpenseModalVisible}
        onClose={() => setIsCreateExpenseModalVisible(false)}
        onSuccess={() => {
          loadData();
        }}
      />

      {/* FAZ 14.3: Banka/Kasa Son 30 Gün Ekstresi Modalı */}
      <BankStatementModal
        visible={isBankStatementModalVisible}
        account={selectedAccountForStatement}
        isCash={treasuryType === 'CASH'}
        onClose={() => {
          setIsBankStatementModalVisible(false);
          setSelectedAccountForStatement(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  refreshIconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  tabBarWrapper: {
    borderBottomWidth: 1,
  },
  tabScrollContent: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {},
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  agingSection: {
    marginBottom: 16,
  },
  agingHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  agingHeroLeft: {
    gap: 2,
  },
  agingHeroLabel: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: '600',
  },
  agingHeroAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#dc2626',
  },
  agingGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  agingPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  agingPillTitle: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  agingPillVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  listHeaderDivider: {
    paddingVertical: 4,
  },
  listHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  paymentsHeader: {
    marginBottom: 12,
  },
  newReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 10,
    gap: 8,
  },
  newReceiptBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  paymentCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  paymentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  paymentContactName: {
    fontSize: 14,
    fontWeight: '700',
  },
  paymentMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  paymentCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountLabel: {
    fontSize: 11,
    flex: 1,
  },
  shareIconBtn: {
    padding: 4,
  },
  edocFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  edocFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  edocFilterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  edocCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  edocCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  edocIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  edocNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  edocType: {
    fontSize: 10,
    fontWeight: '600',
  },
  edocUuid: {
    fontSize: 11,
    marginBottom: 8,
  },
  edocCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  edocDate: {
    fontSize: 11,
  },
  edocViewAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  edocViewText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  emptyCtaBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  checksHeader: {
    marginBottom: 12,
  },
  filterPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusFilterScroll: {
    marginBottom: 12,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  portfolioHero: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  portfolioHeroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  portfolioHeroLabel: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
  portfolioHeroAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e3a8a',
    marginTop: 2,
  },
  heroActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  heroActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  portfolioMiniGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#bfdbfe',
    paddingTop: 10,
    justifyContent: 'space-around',
  },
  portfolioMiniItem: {
    alignItems: 'center',
  },
  miniItemVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
  },
  miniItemLbl: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  expensesHeader: {
    marginBottom: 12,
  },
  expenseHero: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  expenseHeroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expenseHeroLabel: {
    fontSize: 12,
    color: '#065f46',
    fontWeight: '600',
  },
  expenseHeroAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#047857',
    marginTop: 2,
  },
  expenseHeroSub: {
    fontSize: 11,
    color: '#059669',
    marginTop: 4,
  },
  treasuryToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  treasuryToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  treasuryToggleBtnActive: {},
  treasuryToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabletDualPaneWrap: {
    flex: 1,
    padding: 12,
  },
});
