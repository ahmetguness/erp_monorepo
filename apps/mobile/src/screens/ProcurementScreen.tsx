import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { MasterDetailContainer } from '../navigation/MasterDetailContainer';
import { ProcurementInspectionPane } from '../features/procurement';
import { RootStackParamList } from '../types/navigation.types';
import {
  PurchaseOrder,
  PurchaseRequest,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  getPurchaseOrders,
  getPurchaseRequests,
  approvePurchaseRequest,
  convertRequestToOrder,
  getSuppliers,
  getSupplierById,
} from '../services/procurement.service';
import { ContactListItem, ContactDetail } from '../services/contact.service';
import {
  SupplierCard,
  SupplierDetailModal,
  PurchaseOrderCard,
  PurchaseOrderDetailModal,
  PurchaseRequestCard,
  CreatePurchaseRequestModal,
  GoodsReceiptModal,
  ConvertRequestModal,
} from '../components/procurement';

type ProcurementTab = 'ORDERS' | 'REQUESTS' | 'RECEIPT' | 'SUPPLIERS';

interface SegmentOption {
  key: ProcurementTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SEGMENT_OPTIONS: SegmentOption[] = [
  { key: 'ORDERS', label: 'Sipariş (PO)', icon: 'cart-outline' },
  { key: 'REQUESTS', label: 'Talep (PR)', icon: 'clipboard-outline' },
  { key: 'RECEIPT', label: 'Mal Kabul', icon: 'cube-outline' },
  { key: 'SUPPLIERS', label: 'Tedarikçi', icon: 'business-outline' },
];

export default function ProcurementScreen() {
  const { theme } = useTheme();
  const { showMasterDetail } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Procurement'>>();

  const [activeTab, setActiveTab] = useState<ProcurementTab>(
    route.params?.initialTab || 'ORDERS'
  );

  // ── Purchase Orders (PO) State ──
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | PurchaseOrderStatus>('ALL');
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<PurchaseOrder | null>(null);
  const [orderDetailVisible, setOrderDetailVisible] = useState(false);

  // ── Purchase Requests (PR) State ──
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestSearchQuery, setRequestSearchQuery] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | PurchaseRequestStatus>('ALL');
  const [selectedRequestForDetail, setSelectedRequestForDetail] = useState<PurchaseRequest | null>(null);
  const [createRequestVisible, setCreateRequestVisible] = useState(false);
  const [targetSupplierForRequest, setTargetSupplierForRequest] = useState<string | undefined>();
  const [requestToConvert, setRequestToConvert] = useState<PurchaseRequest | null>(null);
  const [convertModalVisible, setConvertModalVisible] = useState(false);

  // ── Goods Receipt State ──
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<PurchaseOrder | null>(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  // ── Suppliers State ──
  const [suppliers, setSuppliers] = useState<ContactListItem[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [supplierBalanceFilter, setSupplierBalanceFilter] = useState<'all' | 'payable'>('all');
  const [selectedSupplierDetail, setSelectedSupplierDetail] = useState<ContactDetail | null>(null);
  const [supplierDetailVisible, setSupplierDetailVisible] = useState(false);

  // ─────────────────────────────────────────────
  // Load Purchase Orders
  // ─────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const params: any = { limit: 50 };
      if (orderStatusFilter !== 'ALL') {
        params.status = orderStatusFilter;
      }
      if (orderSearchQuery.trim()) {
        params.search = orderSearchQuery.trim();
      }
      const res = await getPurchaseOrders(params);
      setOrders(res.items);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingOrders(false);
    }
  }, [orderStatusFilter, orderSearchQuery]);

  useEffect(() => {
    if (activeTab === 'ORDERS' || activeTab === 'RECEIPT') {
      loadOrders();
    }
  }, [activeTab, loadOrders]);

  // ─────────────────────────────────────────────
  // Load Purchase Requests
  // ─────────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const params: any = { limit: 50 };
      if (requestStatusFilter !== 'ALL') {
        params.status = requestStatusFilter;
      }
      if (requestSearchQuery.trim()) {
        params.search = requestSearchQuery.trim();
      }
      const res = await getPurchaseRequests(params);
      setRequests(res.items);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingRequests(false);
    }
  }, [requestStatusFilter, requestSearchQuery]);

  useEffect(() => {
    if (activeTab === 'REQUESTS') {
      loadRequests();
    }
  }, [activeTab, loadRequests]);

  // ─────────────────────────────────────────────
  // Load Suppliers
  // ─────────────────────────────────────────────
  const loadSuppliers = useCallback(async () => {
    setIsLoadingSuppliers(true);
    try {
      const res = await getSuppliers({
        search: supplierSearchQuery.trim() || undefined,
        balanceFilter: supplierBalanceFilter,
        limit: 50,
      });
      setSuppliers(res.items);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, [supplierSearchQuery, supplierBalanceFilter]);

  useEffect(() => {
    if (activeTab === 'SUPPLIERS') {
      loadSuppliers();
    }
  }, [activeTab, loadSuppliers]);

  // ─────────────────────────────────────────────
  // Handlers: Tab Switch
  // ─────────────────────────────────────────────
  const handleTabSelect = (tab: ProcurementTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveTab(tab);
  };

  // ─────────────────────────────────────────────
  // Handlers: Purchase Request Actions
  // ─────────────────────────────────────────────
  const handleApproveRequest = async (req: PurchaseRequest) => {
    try {
      await approvePurchaseRequest(req.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Onaylandı', `"${req.number}" numaralı talep onaylandı.`);
      loadRequests();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Talep onaylanamadı.');
    }
  };

  const handleConvertRequest = (req: PurchaseRequest) => {
    setRequestToConvert(req);
    setConvertModalVisible(true);
  };

  // ─────────────────────────────────────────────
  // Handlers: Supplier 360
  // ─────────────────────────────────────────────
  const handleOpenSupplierDetail = async (supp: ContactListItem) => {
    try {
      const detail = await getSupplierById(supp.id);
      setSelectedSupplierDetail(detail);
      setSupplierDetailVisible(true);
    } catch {
      Alert.alert('Hata', 'Tedarikçi detayları yüklenemedi.');
    }
  };

  const handleCreateRequestForSupplier = (supp: ContactListItem | ContactDetail) => {
    setTargetSupplierForRequest(supp.name);
    setCreateRequestVisible(true);
  };

  // ─────────────────────────────────────────────
  // Handlers: Goods Receipt (13.4)
  // ─────────────────────────────────────────────
  const handleOpenGoodsReceipt = (ord: PurchaseOrder) => {
    setSelectedOrderForReceipt(ord);
    setReceiptModalVisible(true);
  };

  const handleGoodsReceived = () => {
    loadOrders();
  };

  const masterContent = (
    <View style={{ flex: 1 }}>
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
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Satın Alma & Tedarik
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
              Tedarikçi Zinciri & Mal Kabul
            </Text>
          </View>
        </View>

        {/* Global New Request CTA Button */}
        <TouchableOpacity
          style={[styles.newReqBtn, { backgroundColor: theme.colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setTargetSupplierForRequest(undefined);
            setCreateRequestVisible(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#ffffff" />
          <Text style={styles.newReqBtnText}>Talep Aç</Text>
        </TouchableOpacity>
      </View>

      {/* ── Segment Tabs Bar ── */}
      <View
        style={[
          styles.segmentBar,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderBottomColor: theme.colors.borderSubtle,
          },
        ]}
      >
        {SEGMENT_OPTIONS.map((seg) => {
          const isActive = activeTab === seg.key;
          return (
            <TouchableOpacity
              key={seg.key}
              style={[
                styles.segmentTab,
                isActive && [styles.segmentTabActive, { borderBottomColor: theme.colors.primary }],
              ]}
              onPress={() => handleTabSelect(seg.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={seg.icon}
                size={16}
                color={isActive ? theme.colors.primary : theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.segmentTabText,
                  {
                    color: isActive ? theme.colors.primary : theme.colors.textSecondary,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {seg.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tab Views Content ── */}
      <View style={styles.contentArea}>
        {/* ── TAB 1: SATIN ALMA SİPARİŞLERİ (PO) ── */}
        {activeTab === 'ORDERS' && (
          <View style={styles.tabContainer}>
            {/* Search and Filters Strip */}
            <View style={styles.filterStripWrapper}>
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
                  placeholder="Sipariş no, tedarikçi adı veya not..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={orderSearchQuery}
                  onChangeText={setOrderSearchQuery}
                  returnKeyType="search"
                  onSubmitEditing={loadOrders}
                />
                {orderSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setOrderSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Status Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsRow}
              >
                {[
                  { key: 'ALL', label: 'Tümü' },
                  { key: 'SENT', label: 'Gönderildi' },
                  { key: 'PARTIALLY_RECEIVED', label: 'Kısmi Teslim' },
                  { key: 'RECEIVED', label: 'Teslim Alındı' },
                  { key: 'DRAFT', label: 'Taslak' },
                  { key: 'CANCELLED', label: 'İptal' },
                ].map((f) => {
                  const isSelected = orderStatusFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceCard,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setOrderStatusFilter(f.key as any);
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

            {/* Orders List */}
            {isLoadingOrders ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                  Satın alma siparişleri yükleniyor...
                </Text>
              </View>
            ) : (
              <FlatList
                data={orders}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl refreshing={isLoadingOrders} onRefresh={loadOrders} tintColor={theme.colors.primary} />
                }
                renderItem={({ item }) => {
                  const isSelected = (selectedOrderForDetail?.id || orders[0]?.id) === item.id;
                  return (
                    <View
                      style={[
                        showMasterDetail && isSelected && {
                          borderLeftWidth: 3,
                          borderLeftColor: theme.colors.primary,
                          borderRadius: 12,
                          backgroundColor: theme.colors.surface2,
                        },
                      ]}
                    >
                      <PurchaseOrderCard
                        order={item}
                        onPress={(ord) => {
                          setSelectedOrderForDetail(ord);
                          if (!showMasterDetail) {
                            setOrderDetailVisible(true);
                          }
                        }}
                        onReceive={handleOpenGoodsReceipt}
                      />
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="cart-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                      Sipariş Bulunamadı
                    </Text>
                    <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                      Seçilen filtreye veya arama kriterine uygun satın alma siparişi bulunamadı.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        )}

        {/* ── TAB 2: SATIN ALMA TALEPLERİ (PR) ── */}
        {activeTab === 'REQUESTS' && (
          <View style={styles.tabContainer}>
            <View style={styles.filterStripWrapper}>
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
                  placeholder="Talep no veya ürün adı..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={requestSearchQuery}
                  onChangeText={setRequestSearchQuery}
                  returnKeyType="search"
                  onSubmitEditing={loadRequests}
                />
                {requestSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setRequestSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Request Status Filters */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsRow}
              >
                {[
                  { key: 'ALL', label: 'Tümü' },
                  { key: 'DRAFT', label: 'Taslak' },
                  { key: 'PENDING_APPROVAL', label: 'Onay Bekliyor' },
                  { key: 'APPROVED', label: 'Onaylandı' },
                  { key: 'ORDERED', label: 'Sipariş Verildi' },
                  { key: 'REJECTED', label: 'Reddedildi' },
                ].map((f) => {
                  const isSelected = requestStatusFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceCard,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setRequestStatusFilter(f.key as any);
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

            {/* Requests List */}
            {isLoadingRequests ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                  Satın alma talepleri yükleniyor...
                </Text>
              </View>
            ) : (
              <FlatList
                data={requests}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl refreshing={isLoadingRequests} onRefresh={loadRequests} tintColor={theme.colors.primary} />
                }
                renderItem={({ item }) => {
                  const isSelected = (selectedRequestForDetail?.id || requests[0]?.id) === item.id;
                  return (
                    <View
                      style={[
                        showMasterDetail && isSelected && {
                          borderLeftWidth: 3,
                          borderLeftColor: theme.colors.primary,
                          borderRadius: 12,
                          backgroundColor: theme.colors.surface2,
                        },
                      ]}
                    >
                      <PurchaseRequestCard
                        request={item}
                        onPress={() => {
                          setSelectedRequestForDetail(item);
                        }}
                        onApprove={handleApproveRequest}
                        onConvert={handleConvertRequest}
                      />
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="clipboard-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                      Talep Bulunamadı
                    </Text>
                    <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                      Henüz oluşturulmuş bir satın alma talebi bulunmuyor.
                    </Text>
                    <TouchableOpacity
                      style={[styles.emptyCtaBtn, { backgroundColor: theme.colors.primary }]}
                      onPress={() => setCreateRequestVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={16} color="#ffffff" />
                      <Text style={styles.emptyCtaBtnText}>Yeni Talep Aç</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            )}
          </View>
        )}

        {/* ── TAB 3: HIZLI MAL KABUL (RECEIPT) ── */}
        {activeTab === 'RECEIPT' && (
          <View style={styles.tabContainer}>
            <View style={styles.receiptHeroWrapper}>
              <View style={[styles.receiptHeroBanner, { backgroundColor: '#ecfdf5', borderColor: '#10b981' }]}>
                <View style={styles.receiptHeroLeft}>
                  <View style={[styles.receiptHeroIcon, { backgroundColor: '#10b981' }]}>
                    <Ionicons name="cube-outline" size={22} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.receiptHeroTitle, { color: '#065f46' }]}>
                      Depoya Mal Kabul (Goods Receipt)
                    </Text>
                    <Text style={[styles.receiptHeroDesc, { color: '#047857' }]}>
                      Aşağıdaki açık siparişlerden teslim aldığınızı seçerek sayımı tamamlayın.
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* List of pending POs for receipt */}
            <FlatList
              data={orders.filter((o) => o.status === 'SENT' || o.status === 'PARTIALLY_RECEIVED' || o.status === 'DRAFT')}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={isLoadingOrders} onRefresh={loadOrders} tintColor={theme.colors.primary} />
              }
              renderItem={({ item }) => (
                <PurchaseOrderCard
                  order={item}
                  onPress={handleOpenGoodsReceipt}
                  onReceive={handleOpenGoodsReceipt}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="checkmark-done-circle-outline" size={48} color="#10b981" />
                  <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                    Bekleyen Sevkiyat Yok
                  </Text>
                  <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                    Tüm satın alma siparişlerinin mal kabulü tamamlanmış görünüyor.
                  </Text>
                </View>
              }
            />
          </View>
        )}

        {/* ── TAB 4: TEDARİKÇİ 360 REHBERİ ── */}
        {activeTab === 'SUPPLIERS' && (
          <View style={styles.tabContainer}>
            <View style={styles.filterStripWrapper}>
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
                  placeholder="Tedarikçi adı, unvanı veya şehri..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={supplierSearchQuery}
                  onChangeText={setSupplierSearchQuery}
                  returnKeyType="search"
                  onSubmitEditing={loadSuppliers}
                />
                {supplierSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSupplierSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Balance Filter Chips */}
              <View style={styles.filterChipsRow}>
                {[
                  { key: 'all', label: 'Tüm Tedarikçiler' },
                  { key: 'payable', label: 'Borçlu Olduklarımız' },
                ].map((f) => {
                  const isSelected = supplierBalanceFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceCard,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSupplierBalanceFilter(f.key as any);
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
              </View>
            </View>

            {/* Suppliers List */}
            {isLoadingSuppliers ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                  Tedarikçi rehberi yükleniyor...
                </Text>
              </View>
            ) : (
              <FlatList
                data={suppliers}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl refreshing={isLoadingSuppliers} onRefresh={loadSuppliers} tintColor={theme.colors.primary} />
                }
                renderItem={({ item }) => (
                  <SupplierCard
                    supplier={item}
                    onPress={handleOpenSupplierDetail}
                    onCreateRequest={handleCreateRequestForSupplier}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="business-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                      Tedarikçi Bulunamadı
                    </Text>
                    <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                      Arama kriterlerinize uygun tedarikçi kaydı bulunamadı.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        )}
      </View>
    </View>
  );

  const detailContent = (
    <ProcurementInspectionPane
      mode={activeTab === 'REQUESTS' ? 'REQUEST' : 'ORDER'}
      order={selectedOrderForDetail || orders[0] || null}
      request={selectedRequestForDetail || requests[0] || null}
      onReceiveGoods={handleOpenGoodsReceipt}
      onApproveRequest={handleApproveRequest}
      onConvertToOrder={handleConvertRequest}
    />
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      {showMasterDetail && (activeTab === 'ORDERS' || activeTab === 'REQUESTS' || activeTab === 'RECEIPT') ? (
        <MasterDetailContainer masterView={masterContent} detailView={detailContent} />
      ) : (
        masterContent
      )}

      {/* ── Modals ── */}
      {/* Tedarikçi 360 Detay Modalı */}
      <SupplierDetailModal
        visible={supplierDetailVisible}
        supplier={selectedSupplierDetail}
        onClose={() => setSupplierDetailVisible(false)}
        onCreateRequest={handleCreateRequestForSupplier}
      />

      {/* Satın Alma Siparişi Detay Modalı */}
      <PurchaseOrderDetailModal
        visible={orderDetailVisible}
        order={selectedOrderForDetail}
        onClose={() => setOrderDetailVisible(false)}
        onReceiveGoods={handleOpenGoodsReceipt}
        onOrderUpdated={(ord) => {
          setSelectedOrderForDetail(ord);
          loadOrders();
        }}
        onOrderCancelled={() => loadOrders()}
      />

      {/* Yeni Satın Alma Talebi Açma Modalı */}
      <CreatePurchaseRequestModal
        visible={createRequestVisible}
        initialSupplierName={targetSupplierForRequest}
        onClose={() => setCreateRequestVisible(false)}
        onRequestCreated={() => {
          loadRequests();
          setActiveTab('REQUESTS');
        }}
      />

      {/* PO Tabanlı Mal Kabul Modalı (13.4) */}
      <GoodsReceiptModal
        visible={receiptModalVisible}
        order={selectedOrderForReceipt}
        onClose={() => setReceiptModalVisible(false)}
        onGoodsReceived={handleGoodsReceived}
      />

      {/* Talebi Siparişe Dönüştürme Modalı (13.2) */}
      <ConvertRequestModal
        visible={convertModalVisible}
        request={requestToConvert}
        onClose={() => setConvertModalVisible(false)}
        onConverted={() => {
          loadRequests();
          loadOrders();
          setActiveTab('ORDERS');
        }}
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  newReqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  newReqBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segmentTabActive: {},
  segmentTabText: {
    fontSize: 12,
  },
  contentArea: {
    flex: 1,
  },
  tabContainer: {
    flex: 1,
  },
  filterStripWrapper: {
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
    flexDirection: 'row',
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
    gap: 10,
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
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyCtaBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  receiptHeroWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  receiptHeroBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  receiptHeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  receiptHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptHeroTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  receiptHeroDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
});
