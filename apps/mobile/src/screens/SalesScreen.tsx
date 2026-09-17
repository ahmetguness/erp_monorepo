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
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { CartStickyBar, CatalogSplitGrid, LiveCartSummaryPane } from '../features/sales';
import { useAppDispatch, useAppSelector } from '../store/redux';
import {
  selectContact,
  clearContact,
  addItemToCart,
  updateItemQuantity,
  updateItemDiscount,
  removeItemFromCart,
  clearCartItems,
  loadItemsIntoCart,
  selectCartOrder,
  selectCartContact,
  selectCartItemsList,
  selectCartTotals,
  selectIsRiskLimitExceeded,
  CustomerRef,
} from '../store/redux/cartOrderSlice';
import {
  ContactListItem,
  ContactDetail,
  getContacts,
  getContactById,
} from '../services/contact.service';
import {
  ProductLookup,
  lookupProductByBarcode,
} from '../services/inventory.service';
import { apiClient } from '../lib/api-client';
import {
  SalesOrder,
  SalesQuote,
  SalesOrderStatus,
  QuoteStatus,
  FieldVisitData,
  getSalesOrders,
  getSalesQuotes,
  convertQuoteToOrder,
  startLocalVisitSession,
  getActiveVisitSession,
} from '../services/sales.service';
import {
  ContactCard,
  Contact360Modal,
  ProductCatalogCard,
  CartSummaryBar,
  OrderCheckoutModal,
  OrderSuccessModal,
  SalesTargetBanner,
  SalesOrderCard,
  OrderDetailModal,
  SalesQuoteCard,
  QuoteDetailModal,
  CreateQuoteModal,
  ActiveVisitBar,
  FieldVisitModal,
} from '../components/sales';
import { BarcodeScannerModal } from '../components/scanner';
import { Badge } from '../components/common/Badge';
import { formatCurrency, formatDate } from '../lib/utils';

type SalesSegmentTab = 'CUSTOMERS' | 'ORDERS' | 'QUOTES' | 'CATALOG' | 'CART';

interface SegmentOption {
  key: SalesSegmentTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SEGMENT_OPTIONS: SegmentOption[] = [
  { key: 'CUSTOMERS', label: 'Müşteri', icon: 'people-outline' },
  { key: 'ORDERS', label: 'Sipariş', icon: 'receipt-outline' },
  { key: 'QUOTES', label: 'Teklif', icon: 'document-text-outline' },
  { key: 'CATALOG', label: 'Katalog', icon: 'grid-outline' },
  { key: 'CART', label: 'Sepet', icon: 'cart-outline' },
];

export default function SalesScreen() {
  const { theme } = useTheme();
  const { isTablet } = useResponsive();
  const dispatch = useAppDispatch();

  // Redux Cart State
  const cart = useAppSelector(selectCartOrder);
  const selectedCustomer = useAppSelector(selectCartContact);
  const cartItems = useAppSelector(selectCartItemsList);
  const cartTotals = useAppSelector(selectCartTotals);
  const isRiskExceeded = useAppSelector(selectIsRiskLimitExceeded);

  // Cart quantities map for fast lookup
  const cartQuantitiesMap = useMemo(() => {
    const map: Record<string, number> = {};
    cartItems.forEach((it) => {
      map[it.productId] = it.quantity;
    });
    return map;
  }, [cartItems]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<SalesSegmentTab>('CUSTOMERS');

  // Customer List State
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactFilter, setContactFilter] = useState<'ALL' | 'CUSTOMER' | 'RISKY' | 'RECEIVABLE'>('ALL');
  const [selectedContactDetail, setSelectedContactDetail] = useState<ContactDetail | null>(null);
  const [contact360Visible, setContact360Visible] = useState(false);

  // Product Catalog State
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Orders State (FAZ 12.1)
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | SalesOrderStatus>('ALL');
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<SalesOrder | null>(null);
  const [orderDetailVisible, setOrderDetailVisible] = useState(false);

  // Quotes State (FAZ 12.2)
  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quoteSearchQuery, setQuoteSearchQuery] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<'ALL' | QuoteStatus>('ALL');
  const [selectedQuoteForDetail, setSelectedQuoteForDetail] = useState<SalesQuote | null>(null);
  const [quoteDetailVisible, setQuoteDetailVisible] = useState(false);
  const [createQuoteVisible, setCreateQuoteVisible] = useState(false);

  // Field Visit State (FAZ 12.3)
  const [activeVisit, setActiveVisit] = useState<FieldVisitData | null>(null);
  const [visitModalVisible, setVisitModalVisible] = useState(false);

  // Target Banner Refresh Trigger (FAZ 12.4)
  const [targetRefreshTrigger, setTargetRefreshTrigger] = useState(0);

  // Scanner & Order Modals State
  const [scannerVisible, setScannerVisible] = useState(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastCreatedOrder, setLastCreatedOrder] = useState<SalesOrder | null>(null);

  // ─────────────────────────────────────────────
  // Fetch Contacts
  // ─────────────────────────────────────────────

  const loadContacts = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      const params: any = { limit: 50 };
      if (contactSearchQuery.trim()) {
        params.search = contactSearchQuery.trim();
      }
      if (contactFilter === 'CUSTOMER') {
        params.type = 'CUSTOMER';
      } else if (contactFilter === 'RISKY') {
        params.balanceFilter = 'risky';
      } else if (contactFilter === 'RECEIVABLE') {
        params.balanceFilter = 'receivable';
      }

      const res = await getContacts(params);
      setContacts(res.items);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingContacts(false);
    }
  }, [contactSearchQuery, contactFilter]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // ─────────────────────────────────────────────
  // Fetch Products Catalog
  // ─────────────────────────────────────────────

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const params: any = { limit: 50 };
      if (productSearchQuery.trim()) {
        params.search = productSearchQuery.trim();
      }
      const res = await apiClient.get('/api/products', { params });
      if (Array.isArray(res.data?.data)) {
        setProducts(res.data.data);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingProducts(false);
    }
  }, [productSearchQuery]);

  useEffect(() => {
    if (activeTab === 'CATALOG' || (isTablet && activeTab === 'CART')) {
      loadProducts();
    }
  }, [activeTab, isTablet, loadProducts]);

  // ─────────────────────────────────────────────
  // Active Visit on Mount (FAZ 12.3)
  // ─────────────────────────────────────────────

  useEffect(() => {
    getActiveVisitSession().then(setActiveVisit).catch(() => {});
  }, []);

  // ─────────────────────────────────────────────
  // Fetch Sales Orders (FAZ 12.1)
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
      const res = await getSalesOrders(params);
      setOrders(res.items);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingOrders(false);
    }
  }, [orderStatusFilter, orderSearchQuery]);

  useEffect(() => {
    if (activeTab === 'ORDERS') {
      loadOrders();
    }
  }, [activeTab, loadOrders]);

  // ─────────────────────────────────────────────
  // Fetch Sales Quotes (FAZ 12.2)
  // ─────────────────────────────────────────────

  const loadQuotes = useCallback(async () => {
    setIsLoadingQuotes(true);
    try {
      const params: any = { limit: 50 };
      if (quoteStatusFilter !== 'ALL') {
        params.status = quoteStatusFilter;
      }
      if (quoteSearchQuery.trim()) {
        params.search = quoteSearchQuery.trim();
      }
      const res = await getSalesQuotes(params);
      setQuotes(res.items);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingQuotes(false);
    }
  }, [quoteStatusFilter, quoteSearchQuery]);

  useEffect(() => {
    if (activeTab === 'QUOTES') {
      loadQuotes();
    }
  }, [activeTab, loadQuotes]);

  // ─────────────────────────────────────────────
  // Handlers: Reorder, Quote Convert, Field Visit
  // ─────────────────────────────────────────────

  const handleReorderOrder = (order: SalesOrder) => {
    if (!order.items || order.items.length === 0) {
      Alert.alert('Kalem Yok', 'Bu siparişte tekrarlanacak ürün kalemi bulunamadı.');
      return;
    }

    const customerRef: CustomerRef | null = order.contact
      ? {
          id: order.contact.id,
          name: order.contact.name,
          phone: order.contact.phone || null,
        }
      : selectedCustomer;

    const cartItemsToAdd = order.items.map((it) => ({
      productId: it.productId,
      code: it.product?.code || 'URUN',
      name: it.product?.name || it.description || 'Ürün',
      barcode: it.product?.barcode || null,
      unitPrice: it.unitPrice,
      taxRate: it.taxRate,
      discount: it.discount,
      quantity: it.quantity,
      unit: 'AD',
    }));

    dispatch(
      loadItemsIntoCart({
        contact: customerRef,
        items: cartItemsToAdd,
        notes: order.notes || '',
      })
    );

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setActiveTab('CART');
    Alert.alert(
      'Sepete Yüklendi',
      `"${order.number}" numaralı siparişin ${cartItemsToAdd.length} kalemi sepete aktarıldı. Sepet sekmesinden inceleyebilirsiniz.`
    );
  };

  const handleConvertQuoteDirectly = async (quote: SalesQuote) => {
    try {
      const order = await convertQuoteToOrder(quote.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Sipariş Oluşturuldu',
        `"${quote.number}" numaralı teklif "${order.number}" numaralı resmi siparişe dönüştürüldü.`
      );
      loadQuotes();
      loadOrders();
      setTargetRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Teklif siparişe dönüştürülemedi.');
    }
  };

  const handleStartVisit = async (contact: ContactListItem | ContactDetail) => {
    try {
      const session = await startLocalVisitSession(contact.id, contact.name);
      setActiveVisit(session);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Saha Ziyareti Başladı',
        `"${contact.name}" için saha ziyareti başlatıldı. Görüşmeniz bittiğinde üst bardaki "Bitir" butonuna dokunarak CRM notlarınızı kaydedebilirsiniz.`
      );
    } catch {
      Alert.alert('Hata', 'Ziyaret başlatılamadı.');
    }
  };

  const handleVisitCompleted = () => {
    setActiveVisit(null);
  };

  // ─────────────────────────────────────────────
  // Handlers: Tab Switch
  // ─────────────────────────────────────────────

  const handleTabSelect = (tab: SalesSegmentTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveTab(tab);
  };

  // ─────────────────────────────────────────────
  // Handlers: Contact Select & 360
  // ─────────────────────────────────────────────

  const handleOpenContact360 = async (contactItem: ContactListItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const detail = await getContactById(contactItem.id);
      setSelectedContactDetail(detail);
      setContact360Visible(true);
    } catch {
      Alert.alert('Hata', 'Müşteri detayları yüklenemedi.');
    }
  };

  const handleStartOrderWithContact = (contact: ContactListItem | ContactDetail) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const customerRef: CustomerRef = {
      id: contact.id,
      name: contact.name,
      code: contact.code,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      creditLimit: contact.creditLimit,
      currentBalance:
        'financials' in contact && contact.financials
          ? contact.financials.currentBalance
          : 'currentBalance' in contact
          ? contact.currentBalance
          : 0,
      riskLevel:
        'financials' in contact && contact.financials
          ? contact.financials.riskLevel
          : 'riskLevel' in contact
          ? contact.riskLevel
          : 'none',
    };

    dispatch(selectContact(customerRef));
    setContact360Visible(false);
    setActiveTab('CATALOG');
  };

  // ─────────────────────────────────────────────
  // Handlers: Catalog Actions
  // ─────────────────────────────────────────────

  const handleIncrementProduct = (p: ProductLookup) => {
    dispatch(
      addItemToCart({
        productId: p.id,
        code: p.code,
        name: p.name,
        barcode: p.barcode,
        unitPrice: p.salesPrice,
        taxRate: p.taxRate?.rate ?? 20,
        unit: p.unit?.code || 'AD',
        quantity: 1,
      })
    );
  };

  const handleDecrementProduct = (p: ProductLookup) => {
    const currentQty = cart.items[p.id]?.quantity || 0;
    if (currentQty <= 1) {
      dispatch(removeItemFromCart(p.id));
    } else {
      dispatch(updateItemQuantity({ productId: p.id, quantity: currentQty - 1 }));
    }
  };

  // ─────────────────────────────────────────────
  // Handlers: Barcode Scanner
  // ─────────────────────────────────────────────

  const handleBarcodeScanned = async (barcode: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const { product } = await lookupProductByBarcode(barcode);
      if (product) {
        dispatch(
          addItemToCart({
            productId: product.id,
            code: product.code,
            name: product.name,
            barcode: product.barcode,
            unitPrice: product.salesPrice,
            taxRate: product.taxRate?.rate ?? 20,
            unit: product.unit?.code || 'AD',
            quantity: 1,
          })
        );
        Alert.alert(
          'Sepete Eklendi',
          `"${product.name}" (${formatCurrency(product.salesPrice)}) başarıyla sepete eklendi.`
        );
      } else {
        Alert.alert('Ürün Bulunamadı', `"${barcode}" barkodlu ürün sistemde bulunamadı.`);
      }
    } catch {
      Alert.alert('Hata', 'Ürün sorgulanırken bağlantı hatası oluştu.');
    }
  };

  // ─────────────────────────────────────────────
  // Handlers: Order Success
  // ─────────────────────────────────────────────

  const handleOrderSuccess = (order: SalesOrder) => {
    setLastCreatedOrder(order);
    setSuccessModalVisible(true);
    setTargetRefreshTrigger((prev) => prev + 1);
    loadOrders();
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
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Saha Satış
          </Text>

          {/* Active Customer Chip in Header */}
          <TouchableOpacity
            style={[
              styles.customerHeaderChip,
              {
                backgroundColor: selectedCustomer
                  ? theme.colors.primaryMuted
                  : theme.colors.borderSubtle,
              },
            ]}
            onPress={() => setActiveTab('CUSTOMERS')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="person-outline"
              size={12}
              color={selectedCustomer ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.customerHeaderChipText,
                { color: selectedCustomer ? theme.colors.primary : theme.colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {selectedCustomer ? selectedCustomer.name : 'Müşteri Seçin'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Global Camera Scanner CTA Button in Header */}
        <TouchableOpacity
          style={[styles.cameraBtn, { backgroundColor: theme.colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setScannerVisible(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="barcode-outline" size={18} color="#ffffff" />
          <Text style={styles.cameraBtnText}>Barkod</Text>
        </TouchableOpacity>
      </View>

      {/* ── 12.4: Sales Target Banner ── */}
      <SalesTargetBanner onRefreshTrigger={targetRefreshTrigger} />

      {/* ── 12.3: Active Field Visit Live Bar ── */}
      {activeVisit && (
        <ActiveVisitBar
          activeVisit={activeVisit}
          onFinishPress={() => setVisitModalVisible(true)}
        />
      )}

      {/* ── Module Segment Tabs Bar ── */}
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
          const badgeCount = seg.key === 'CART' ? cartTotals.totalItems : undefined;

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

              {typeof badgeCount === 'number' && badgeCount > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.tabBadgeText}>{badgeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tab Views Content ── */}
      <View style={styles.contentArea}>
        {/* ── TAB 1: MÜŞTERİ 360 (CARİLER) ── */}
        {activeTab === 'CUSTOMERS' && (
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
                  placeholder="Müşteri adı, unvan, kod veya şehir..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={contactSearchQuery}
                  onChangeText={setContactSearchQuery}
                  returnKeyType="search"
                  onSubmitEditing={loadContacts}
                />
                {contactSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setContactSearchQuery('')}>
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
                  { key: 'ALL', label: 'Tümü' },
                  { key: 'CUSTOMER', label: 'Müşteriler' },
                  { key: 'RECEIVABLE', label: 'Borçlu Cariler' },
                  { key: 'RISKY', label: 'Riskli Cariler' },
                ].map((f) => {
                  const isSelected = contactFilter === f.key;
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
                        setContactFilter(f.key as any);
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

            {/* Contacts List */}
            {isLoadingContacts ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                  Müşteri kayıtları yükleniyor...
                </Text>
              </View>
            ) : (
              <FlatList
                data={contacts}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isLoadingContacts}
                    onRefresh={loadContacts}
                    tintColor={theme.colors.primary}
                  />
                }
                renderItem={({ item }) => (
                  <ContactCard
                    contact={item}
                    onPress={handleOpenContact360}
                    onStartOrder={handleStartOrderWithContact}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="people-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                      Müşteri Bulunamadı
                    </Text>
                    <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                      Aradığınız kriterlere uygun cari hesap kaydı bulunamadı.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        )}

        {/* ── TAB: SİPARİŞ TAKİP MERKEZİ (FAZ 12.1) ── */}
        {activeTab === 'ORDERS' && (
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
                  placeholder="Sipariş no, müşteri veya açıklama..."
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

              {/* Order Status Filters */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsRow}
              >
                {[
                  { key: 'ALL', label: 'Tümü' },
                  { key: 'CONFIRMED', label: 'Onaylandı' },
                  { key: 'PARTIALLY_DELIVERED', label: 'Kısmi Sevk' },
                  { key: 'DELIVERED', label: 'Teslim Edildi' },
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
                  Sipariş kayıtları yükleniyor...
                </Text>
              </View>
            ) : (
              <FlatList
                data={orders}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isLoadingOrders}
                    onRefresh={loadOrders}
                    tintColor={theme.colors.primary}
                  />
                }
                renderItem={({ item }) => (
                  <SalesOrderCard
                    order={item}
                    onPress={(ord) => {
                      setSelectedOrderForDetail(ord);
                      setOrderDetailVisible(true);
                    }}
                    onReorder={handleReorderOrder}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="receipt-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                      Sipariş Bulunamadı
                    </Text>
                    <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                      Seçilen filtreye veya arama kriterine uygun sipariş kaydı bulunamadı.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        )}

        {/* ── TAB: SATIŞ TEKLİFLERİ (FAZ 12.2) ── */}
        {activeTab === 'QUOTES' && (
          <View style={styles.tabContainer}>
            <View style={styles.filterStripWrapper}>
              <View style={styles.quoteTopRow}>
                <View
                  style={[
                    styles.searchBar,
                    {
                      flex: 1,
                      backgroundColor: theme.colors.surfaceCard,
                      borderColor: theme.colors.borderSubtle,
                      borderRadius: theme.borderRadius.md,
                    },
                  ]}
                >
                  <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: theme.colors.text }]}
                    placeholder="Teklif no veya müşteri..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={quoteSearchQuery}
                    onChangeText={setQuoteSearchQuery}
                    returnKeyType="search"
                    onSubmitEditing={loadQuotes}
                  />
                  {quoteSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setQuoteSearchQuery('')}>
                      <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.newQuoteBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setCreateQuoteVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={18} color="#ffffff" />
                  <Text style={styles.newQuoteBtnText}>Yeni</Text>
                </TouchableOpacity>
              </View>

              {/* Quote Status Filters */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsRow}
              >
                {[
                  { key: 'ALL', label: 'Tümü' },
                  { key: 'DRAFT', label: 'Taslak' },
                  { key: 'SENT', label: 'Gönderildi' },
                  { key: 'ACCEPTED', label: 'Kabul Edildi' },
                  { key: 'REJECTED', label: 'Reddedildi' },
                  { key: 'EXPIRED', label: 'Süresi Doldu' },
                  { key: 'CANCELLED', label: 'İptal' },
                ].map((f) => {
                  const isSelected = quoteStatusFilter === f.key;
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
                        setQuoteStatusFilter(f.key as any);
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

            {/* Quotes List */}
            {isLoadingQuotes ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                  Teklif kayıtları yükleniyor...
                </Text>
              </View>
            ) : (
              <FlatList
                data={quotes}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isLoadingQuotes}
                    onRefresh={loadQuotes}
                    tintColor={theme.colors.primary}
                  />
                }
                renderItem={({ item }) => (
                  <SalesQuoteCard
                    quote={item}
                    onPress={(q) => {
                      setSelectedQuoteForDetail(q);
                      setQuoteDetailVisible(true);
                    }}
                    onConvertToOrder={handleConvertQuoteDirectly}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                      Teklif Bulunamadı
                    </Text>
                    <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                      Henüz hazırlanmış bir teklif bulunamadı veya arama sonucu boş.
                    </Text>
                    <TouchableOpacity
                      style={[styles.emptyCtaBtn, { backgroundColor: theme.colors.primary }]}
                      onPress={() => setCreateQuoteVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={16} color="#ffffff" />
                      <Text style={styles.emptyCtaBtnText}>Yeni Teklif Hazırla</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            )}
          </View>
        )}

        {/* ── TABLET POS SPLIT VIEW (CATALOG + LIVE CART SIDE-BY-SIDE) ── */}
        {isTablet && (activeTab === 'CATALOG' || activeTab === 'CART') ? (
          <View style={styles.tabletSplitWrapper}>
            <View style={styles.tabletSplitLeft}>
              <CatalogSplitGrid
                products={products}
                isLoading={isLoadingProducts}
                cartQuantities={cartQuantitiesMap}
                searchQuery={productSearchQuery}
                onSearchChange={setProductSearchQuery}
                onRefresh={loadProducts}
                onIncrement={handleIncrementProduct}
                onDecrement={handleDecrementProduct}
                onOpenScanner={() => setScannerVisible(true)}
              />
            </View>
            <View style={styles.tabletSplitRight}>
              <LiveCartSummaryPane
                customer={selectedCustomer}
                items={cartItems}
                subtotal={cartTotals.subtotal}
                totalDiscount={cartTotals.totalDiscount}
                totalTax={cartTotals.totalTax}
                grandTotal={cartTotals.grandTotal}
                onUpdateQuantity={(productId, qty) => {
                  if (qty <= 0) {
                    dispatch(removeItemFromCart(productId));
                  } else {
                    dispatch(updateItemQuantity({ productId, quantity: qty }));
                  }
                }}
                onRemoveItem={(productId) => dispatch(removeItemFromCart(productId))}
                onSelectCustomer={() => setActiveTab('CUSTOMERS')}
                onClearCart={() => dispatch(clearCartItems())}
                onCheckout={() => {
                  if (!selectedCustomer) {
                    Alert.alert('Müşteri Seçiniz', 'Lütfen önce siparişin kesileceği müşteriyi seçin.');
                    setActiveTab('CUSTOMERS');
                    return;
                  }
                  setCheckoutModalVisible(true);
                }}
              />
            </View>
          </View>
        ) : (
          <>
            {/* ── TAB 2: ÜRÜN KATALOĞU (PHONE) ── */}
            {activeTab === 'CATALOG' && (
              <View style={styles.tabContainer}>
                {/* Search and Hero Banner */}
                <View style={styles.catalogHeaderWrapper}>
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
                      placeholder="Ürün adı, SKU veya barkod ara..."
                      placeholderTextColor={theme.colors.textMuted}
                      value={productSearchQuery}
                      onChangeText={setProductSearchQuery}
                      returnKeyType="search"
                      onSubmitEditing={loadProducts}
                    />
                    {productSearchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setProductSearchQuery('')}>
                        <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Quick Barcode Scan CTA Banner */}
                  <TouchableOpacity
                    style={[
                      styles.scannerHeroBanner,
                      {
                        backgroundColor: theme.colors.primaryMuted,
                        borderColor: theme.colors.primary,
                        borderRadius: theme.borderRadius.md,
                      },
                    ]}
                    onPress={() => setScannerVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.scannerHeroLeft}>
                      <View style={[styles.scannerHeroIcon, { backgroundColor: theme.colors.primary }]}>
                        <Ionicons name="barcode-outline" size={20} color="#ffffff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.scannerHeroTitle, { color: theme.colors.primary }]}>
                          Kamerayla Barkod Tara & Sepete Ekle
                        </Text>
                        <Text style={[styles.scannerHeroDesc, { color: theme.colors.textSecondary }]}>
                          Müşterinin seçtiği ürünlerin barkodunu vizöre tutun
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* Products Catalog List */}
                {isLoadingProducts ? (
                  <View style={styles.centerLoading}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                      Ürün kataloğu yükleniyor...
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={products}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={[
                      styles.listContent,
                      cartTotals.totalItems > 0 && { paddingBottom: 90 },
                    ]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                      <RefreshControl
                        refreshing={isLoadingProducts}
                        onRefresh={loadProducts}
                        tintColor={theme.colors.primary}
                      />
                    }
                    renderItem={({ item }) => (
                      <ProductCatalogCard
                        product={item}
                        quantityInCart={cart.items[item.id]?.quantity || 0}
                        onIncrement={handleIncrementProduct}
                        onDecrement={handleDecrementProduct}
                      />
                    )}
                    ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                        <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
                        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                          Ürün Bulunamadı
                        </Text>
                        <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                          Aradığınız kritere uygun satış ürünü bulunamadı.
                        </Text>
                      </View>
                    }
                  />
                )}

                {/* Floating Live Cart Summary Bar */}
                <CartStickyBar
                  customer={selectedCustomer}
                  totalItems={cartTotals.totalItems}
                  totalQuantity={cartTotals.totalQuantity}
                  grandTotal={cartTotals.grandTotal}
                  onPressCart={() => setActiveTab('CART')}
                  onPressCustomer={() => setActiveTab('CUSTOMERS')}
                />

              </View>
            )}

            {/* ── TAB 3: SİPARİŞ SEPETİ (PHONE) ── */}
            {activeTab === 'CART' && (
              <View style={styles.tabContainer}>
                {cartItems.length === 0 ? (
                  <View style={styles.emptyCartContainer}>
                    <Ionicons name="cart-outline" size={64} color={theme.colors.textMuted} />
                    <Text style={[styles.emptyCartTitle, { color: theme.colors.text }]}>
                      Sipariş Sepetiniz Boş
                    </Text>
                    <Text style={[styles.emptyCartDesc, { color: theme.colors.textMuted }]}>
                      Katalog sekmesinden ürün seçerek veya kamerayla barkod okutarak sepete ürün
                      ekleyebilirsiniz.
                    </Text>
                    <TouchableOpacity
                      style={[styles.goToCatalogBtn, { backgroundColor: theme.colors.primary }]}
                      onPress={() => setActiveTab('CATALOG')}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="grid-outline" size={18} color="#ffffff" />
                      <Text style={styles.goToCatalogBtnText}>Ürün Kataloğuna Git</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <ScrollView
                      contentContainerStyle={styles.cartScrollContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {/* Selected Customer Header Card */}
                      <TouchableOpacity
                        style={[
                          styles.cartCustomerCard,
                          {
                            backgroundColor: theme.colors.surfaceCard,
                            borderColor: selectedCustomer ? theme.colors.borderSubtle : theme.colors.warning,
                            borderRadius: theme.borderRadius.lg,
                            ...theme.shadows.sm,
                          },
                        ]}
                        onPress={() => setActiveTab('CUSTOMERS')}
                        activeOpacity={0.7}
                      >
                        <View style={styles.customerCardLeft}>
                          <View
                            style={[
                              styles.customerIcon,
                              {
                                backgroundColor: selectedCustomer
                                  ? theme.colors.primaryMuted
                                  : theme.colors.warningMuted,
                              },
                            ]}
                          >
                            <Ionicons
                              name="person"
                              size={18}
                              color={selectedCustomer ? theme.colors.primary : theme.colors.warning}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.customerLabel, { color: theme.colors.textMuted }]}>
                              SİPARİŞ VERİLEN MÜŞTERİ
                            </Text>
                            <Text
                              style={[styles.customerName, { color: theme.colors.text }]}
                              numberOfLines={1}
                            >
                              {selectedCustomer ? selectedCustomer.name : 'Müşteri Seçilmedi (Zorunlu)'}
                            </Text>
                            {selectedCustomer && (
                              <Text style={[styles.customerMeta, { color: theme.colors.textSecondary }]}>
                                Bakiye: {formatCurrency(selectedCustomer.currentBalance ?? 0)}
                                {selectedCustomer.creditLimit
                                  ? ` • Limit: ${formatCurrency(selectedCustomer.creditLimit)}`
                                  : ''}
                              </Text>
                            )}
                          </View>
                        </View>

                        <Text style={[styles.changeCustText, { color: theme.colors.primary }]}>
                          {selectedCustomer ? 'Değiştir' : 'Müşteri Seç'}
                        </Text>
                      </TouchableOpacity>

                      {/* Cart Items List */}
                      <View
                        style={[
                          styles.cartItemsCard,
                          {
                            backgroundColor: theme.colors.surfaceCard,
                            borderColor: theme.colors.borderSubtle,
                            borderRadius: theme.borderRadius.lg,
                            ...theme.shadows.sm,
                          },
                        ]}
                      >
                        <View style={styles.cartCardHeader}>
                          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                            Sepet Kalemleri ({cartItems.length})
                          </Text>
                          <TouchableOpacity onPress={() => dispatch(clearCartItems())}>
                            <Text style={[styles.clearBtnText, { color: theme.colors.danger }]}>
                              Sepeti Boşalt
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {cartItems.map((item) => (
                          <View
                            key={item.productId}
                            style={[
                              styles.cartItemRow,
                              { borderBottomColor: theme.colors.borderSubtle },
                            ]}
                          >
                            <View style={styles.cartItemLeft}>
                              <Text
                                style={[styles.cartItemName, { color: theme.colors.text }]}
                                numberOfLines={1}
                              >
                                {item.name}
                              </Text>
                              <Text style={[styles.cartItemMeta, { color: theme.colors.textMuted }]}>
                                SKU: {item.code} • Birim: {formatCurrency(item.unitPrice)}
                              </Text>
                            </View>

                            <View style={styles.cartItemRight}>
                              {/* Stepper */}
                              <View style={styles.cartStepper}>
                                <TouchableOpacity
                                  style={[
                                    styles.cartStepBtn,
                                    { backgroundColor: theme.colors.borderSubtle },
                                  ]}
                                  onPress={() => {
                                    if (item.quantity <= 1) {
                                      dispatch(removeItemFromCart(item.productId));
                                    } else {
                                      dispatch(
                                        updateItemQuantity({
                                          productId: item.productId,
                                          quantity: item.quantity - 1,
                                        })
                                      );
                                    }
                                  }}
                                >
                                  <Ionicons
                                    name={item.quantity === 1 ? 'trash-outline' : 'remove'}
                                    size={14}
                                    color={item.quantity === 1 ? theme.colors.danger : theme.colors.text}
                                  />
                                </TouchableOpacity>

                                <Text style={[styles.cartStepVal, { color: theme.colors.text }]}>
                                  {item.quantity}
                                </Text>

                                <TouchableOpacity
                                  style={[
                                    styles.cartStepBtn,
                                    { backgroundColor: theme.colors.primary },
                                  ]}
                                  onPress={() => {
                                    dispatch(
                                      updateItemQuantity({
                                        productId: item.productId,
                                        quantity: item.quantity + 1,
                                      })
                                    );
                                  }}
                                >
                                  <Ionicons name="add" size={14} color="#ffffff" />
                                </TouchableOpacity>
                              </View>

                              {/* Line Total */}
                              <Text style={[styles.cartItemTotal, { color: theme.colors.primary }]}>
                                {formatCurrency(item.quantity * item.unitPrice * (1 - item.discount / 100))}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>

                      {/* Financial Summary Card */}
                      <View
                        style={[
                          styles.cartItemsCard,
                          {
                            backgroundColor: theme.colors.surfaceCard,
                            borderColor: theme.colors.borderSubtle,
                            borderRadius: theme.borderRadius.lg,
                            ...theme.shadows.sm,
                          },
                        ]}
                      >
                        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                          Sipariş Tutarı
                        </Text>

                        <View style={styles.summaryRow}>
                          <Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>
                            Ara Toplam
                          </Text>
                          <Text style={[styles.summaryVal, { color: theme.colors.text }]}>
                            {formatCurrency(cartTotals.subtotal)}
                          </Text>
                        </View>

                        {cartTotals.totalDiscount > 0 && (
                          <View style={styles.summaryRow}>
                            <Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>
                              İskonto Toplamı
                            </Text>
                            <Text style={[styles.summaryVal, { color: theme.colors.danger }]}>
                              -{formatCurrency(cartTotals.totalDiscount)}
                            </Text>
                          </View>
                        )}

                        <View style={styles.summaryRow}>
                          <Text style={[styles.summaryKey, { color: theme.colors.textMuted }]}>
                            KDV Toplamı
                          </Text>
                          <Text style={[styles.summaryVal, { color: theme.colors.text }]}>
                            +{formatCurrency(cartTotals.totalTax)}
                          </Text>
                        </View>

                        <View style={[styles.cartDivider, { backgroundColor: theme.colors.borderSubtle }]} />

                        <View style={styles.grandTotalRow}>
                          <Text style={[styles.grandTotalLabel, { color: theme.colors.text }]}>
                            GENEL TOPLAM
                          </Text>
                          <Text style={[styles.grandTotalValue, { color: theme.colors.primary }]}>
                            {formatCurrency(cartTotals.grandTotal)}
                          </Text>
                        </View>
                      </View>
                    </ScrollView>

                {/* Bottom Checkout CTA Bar */}
                <View
                  style={[
                    styles.cartBottomBar,
                    {
                      backgroundColor: theme.colors.surfaceCard,
                      borderTopColor: theme.colors.borderSubtle,
                      ...theme.shadows.md,
                    },
                  ]}
                >
                  <View style={styles.checkoutTotalCol}>
                    <Text style={[styles.checkoutTotalLabel, { color: theme.colors.textMuted }]}>
                      TOPLAM ({cartTotals.totalQuantity} ADET)
                    </Text>
                    <Text style={[styles.checkoutTotalValue, { color: theme.colors.primary }]}>
                      {formatCurrency(cartTotals.grandTotal)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.checkoutBtn,
                      {
                        backgroundColor: theme.colors.primary,
                        opacity: !selectedCustomer ? 0.6 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (!selectedCustomer) {
                        Alert.alert('Müşteri Seçiniz', 'Lütfen önce siparişin kesileceği müşteriyi seçin.');
                        setActiveTab('CUSTOMERS');
                        return;
                      }
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      setCheckoutModalVisible(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="arrow-forward-circle" size={20} color="#ffffff" />
                    <Text style={styles.checkoutBtnText}>Siparişi Tamamla</Text>
                  </TouchableOpacity>
                </View>
                  </>
                )}
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Modals ── */}
      {/* Müşteri 360 Detay Modalı */}
      <Contact360Modal
        visible={contact360Visible}
        contact={selectedContactDetail}
        onClose={() => setContact360Visible(false)}
        onStartOrder={handleStartOrderWithContact}
        onStartVisit={handleStartVisit}
      />

      {/* Sipariş Detay Modalı (FAZ 12.1) */}
      <OrderDetailModal
        visible={orderDetailVisible}
        order={selectedOrderForDetail}
        onClose={() => setOrderDetailVisible(false)}
        onReorder={handleReorderOrder}
        onOrderCancelled={() => {
          loadOrders();
          setTargetRefreshTrigger((p) => p + 1);
        }}
      />

      {/* Teklif Detay Modalı (FAZ 12.2) */}
      <QuoteDetailModal
        visible={quoteDetailVisible}
        quote={selectedQuoteForDetail}
        onClose={() => setQuoteDetailVisible(false)}
        onConvertedToOrder={() => {
          loadQuotes();
          loadOrders();
          setTargetRefreshTrigger((p) => p + 1);
        }}
      />

      {/* Yeni Teklif Hazırlama Modalı (FAZ 12.2) */}
      <CreateQuoteModal
        visible={createQuoteVisible}
        onClose={() => setCreateQuoteVisible(false)}
        onQuoteCreated={() => {
          loadQuotes();
          setActiveTab('QUOTES');
        }}
      />

      {/* Saha Ziyareti Tamamlama & CRM Notu Modalı (FAZ 12.3) */}
      <FieldVisitModal
        visible={visitModalVisible}
        visit={activeVisit}
        onClose={() => setVisitModalVisible(false)}
        onVisitCompleted={handleVisitCompleted}
        onVisitCancelled={handleVisitCompleted}
      />

      {/* Kamera Barkod Okuyucu Modalı */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onBarcodeScanned={handleBarcodeScanned}
        title="Sipariş İçin Barkod Oku"
        subtitle="Ürün barkodunu vizöre hizalayarak sepete ekleyin"
      />

      {/* Sipariş Tamamlama / Onay Modalı */}
      <OrderCheckoutModal
        visible={checkoutModalVisible}
        onClose={() => setCheckoutModalVisible(false)}
        onOrderSuccess={handleOrderSuccess}
        onSelectCustomerPress={() => {
          setCheckoutModalVisible(false);
          setActiveTab('CUSTOMERS');
        }}
      />

      {/* Sipariş Başarı ve Paylaşım Modalı */}
      <OrderSuccessModal
        visible={successModalVisible}
        order={lastCreatedOrder}
        onClose={() => setSuccessModalVisible(false)}
        onNewOrder={() => {
          setSuccessModalVisible(false);
          setActiveTab('CATALOG');
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
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  customerHeaderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    maxWidth: 130,
  },
  customerHeaderChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  cameraBtnText: {
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
    fontSize: 13,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
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
  catalogHeaderWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  scannerHeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1.5,
  },
  scannerHeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  scannerHeroIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerHeroTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  scannerHeroDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyCartContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyCartTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  emptyCartDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  goToCatalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  goToCatalogBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  cartScrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 90,
  },
  cartCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1.5,
  },
  customerCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  customerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  customerMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  changeCustText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cartItemsCard: {
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  cartCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  cartItemLeft: {
    flex: 1,
    marginRight: 8,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  cartItemMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartStepBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStepVal: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center',
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 65,
    textAlign: 'right',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  summaryKey: {
    fontSize: 12,
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  cartDivider: {
    height: 1,
    marginVertical: 4,
  },
  grandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cartBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  checkoutTotalCol: {
    flex: 1,
  },
  checkoutTotalLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  checkoutTotalValue: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 1,
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  checkoutBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  quoteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newQuoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  newQuoteBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
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
  tabletSplitWrapper: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 16,
  },
  tabletSplitLeft: {
    flex: 0.65,
  },
  tabletSplitRight: {
    flex: 0.35,
  },
});
