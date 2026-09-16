import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Share,
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
} from '../services/finance.service';
import {
  OverdueInvoiceCard,
  PaymentReceiptModal,
  EDocumentPreviewModal,
} from '../components/finance';
import { Badge } from '../components/common/Badge';

type FinanceTab = 'overdue' | 'payments' | 'edocuments';

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

  const [activeTab, setActiveTab] = useState<FinanceTab>(
    route?.params?.initialTab || 'overdue',
  );

  // Tab 1: Overdue Invoices & Aging
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [agingSummary, setAgingSummary] = useState<AgingSummary | null>(null);

  // Tab 2: Payments (Tahsilatlar)
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Tab 3: E-Documents
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
  }, [activeTab, route?.params?.contactId]);

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

  // Filtered Overdue
  const filteredOverdue = useMemo(() => {
    if (!searchQuery.trim()) return overdueInvoices;
    const q = searchQuery.toLowerCase();
    return overdueInvoices.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        inv.contact?.name.toLowerCase().includes(q),
    );
  }, [overdueInvoices, searchQuery]);

  // Filtered Payments
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

  // Filtered E-Documents
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

  const formatCurrency = (val?: number | null): string => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(val || 0);
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
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Hızlı Finans & Tahsilat</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
            Vadesi Geçenler, Makbuz & E-Belge
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshIconBtn, { backgroundColor: theme.colors.surfaceCard }]}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="reload" size={18} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Segmented Tab Navigation */}
      <View style={[styles.tabBar, { borderBottomColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceCard }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'overdue' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }]]}
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
          style={[styles.tabItem, activeTab === 'payments' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }]]}
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

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'edocuments' && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }]]}
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
        <FlatList
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
        <FlatList
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
      {/* TAB 3: E-Belge & Fatura Önizleme (FAZ 7.3)                    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'edocuments' && (
        <FlatList
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
  refreshIconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
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
});
