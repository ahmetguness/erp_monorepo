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
import { useAppDispatch, useAppSelector } from '../store/redux';
import {
  selectContact,
  clearContact,
  addItemToCart,
  updateItemQuantity,
  updateItemDiscount,
  removeItemFromCart,
  clearCartItems,
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
import { SalesOrder } from '../services/sales.service';
import {
  ContactCard,
  Contact360Modal,
  ProductCatalogCard,
  CartSummaryBar,
  OrderCheckoutModal,
  OrderSuccessModal,
} from '../components/sales';
import { BarcodeScannerModal } from '../components/scanner';
import { Badge } from '../components/common/Badge';
import { formatCurrency } from '../lib/utils';

type SalesSegmentTab = 'CUSTOMERS' | 'CATALOG' | 'CART';

interface SegmentOption {
  key: SalesSegmentTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SEGMENT_OPTIONS: SegmentOption[] = [
  { key: 'CUSTOMERS', label: 'Müşteri 360', icon: 'people-outline' },
  { key: 'CATALOG', label: 'Katalog', icon: 'grid-outline' },
  { key: 'CART', label: 'Sipariş Sepeti', icon: 'cart-outline' },
];

export default function SalesScreen() {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();

  // Redux Cart State
  const cart = useAppSelector(selectCartOrder);
  const selectedCustomer = useAppSelector(selectCartContact);
  const cartItems = useAppSelector(selectCartItemsList);
  const cartTotals = useAppSelector(selectCartTotals);
  const isRiskExceeded = useAppSelector(selectIsRiskLimitExceeded);

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
    if (activeTab === 'CATALOG') {
      loadProducts();
    }
  }, [activeTab, loadProducts]);

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

        {/* ── TAB 2: ÜRÜN KATALOĞU ── */}
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
            <CartSummaryBar
              customer={selectedCustomer}
              totalItems={cartTotals.totalItems}
              totalQuantity={cartTotals.totalQuantity}
              grandTotal={cartTotals.grandTotal}
              onPressCart={() => setActiveTab('CART')}
              onPressCustomer={() => setActiveTab('CUSTOMERS')}
            />
          </View>
        )}

        {/* ── TAB 3: SİPARİŞ SEPETİ ── */}
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
      </View>

      {/* ── Modals ── */}
      {/* Müşteri 360 Detay Modalı */}
      <Contact360Modal
        visible={contact360Visible}
        contact={selectedContactDetail}
        onClose={() => setContact360Visible(false)}
        onStartOrder={handleStartOrderWithContact}
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
});
