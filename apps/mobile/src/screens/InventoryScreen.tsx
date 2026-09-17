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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { ShelfPlanogramGrid } from '../features/inventory';
import { useAppDispatch, useAppSelector } from '../store/redux';
import {
  setMode,
  setWarehouses as setReduxWarehouses,
  addScan,
  setExpectedItems,
  selectWarehouseSession,
  WarehouseSessionMode,
  ExpectedItem,
} from '../store/redux/warehouseSessionSlice';
import {
  Warehouse,
  Location,
  ProductLookup,
  StockLevel,
  getWarehouses,
  lookupProductByBarcode,
  getWarehouseStockLevels,
} from '../services/inventory.service';
import {
  BarcodeScannerModal,
  StockLookupModal,
  WarehouseSelectorModal,
  StockCountSessionView,
  StockTransferSessionView,
  DeliveryVerificationView,
  ShelfStockLookupModal,
  LocationTransferModal,
  OrderPickListModal,
  PrinterSettingsModal,
} from '../components';
import { formatCurrency } from '../lib/utils';

interface SegmentTab {
  key: WarehouseSessionMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SEGMENT_TABS: SegmentTab[] = [
  { key: 'LOOKUP', label: 'Stok Sorgu', icon: 'barcode-outline' },
  { key: 'COUNT', label: 'Hızlı Sayım', icon: 'clipboard-outline' },
  { key: 'TRANSFER', label: 'Transfer', icon: 'swap-horizontal-outline' },
  { key: 'DELIVERY', label: 'Mal Kabul', icon: 'file-tray-full-outline' },
  { key: 'PLANOGRAM', label: 'Raf Planogramı', icon: 'grid-outline' },
];

export default function InventoryScreen() {
  const { theme, isHighContrast, toggleHighContrast } = useTheme();
  const { isTablet } = useResponsive();
  const dispatch = useAppDispatch();
  const { activeMode } = useAppSelector(selectWarehouseSession);

  // Warehouses list
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [targetWarehouse, setTargetWarehouse] = useState<Warehouse | null>(null);

  // Warehouse picker modal
  const [whModalVisible, setWhModalVisible] = useState(false);
  const [whPickerTarget, setWhPickerTarget] = useState<'SOURCE' | 'TARGET'>('SOURCE');

  // Scanner Modal
  const [scannerVisible, setScannerVisible] = useState(false);

  // WMS 2.0 Modals State
  const [shelfModalVisible, setShelfModalVisible] = useState(false);
  const [locationTransferVisible, setLocationTransferVisible] = useState(false);
  const [transferStockItem, setTransferStockItem] = useState<StockLevel | null>(null);
  const [transferLocation, setTransferLocation] = useState<Location | null>(null);
  const [pickListVisible, setPickListVisible] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);

  // Product Lookup State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductLookup[]>([]);
  const [lookupModalVisible, setLookupModalVisible] = useState(false);
  const [activeProduct, setActiveProduct] = useState<ProductLookup | null>(null);
  const [activeStockLevels, setActiveStockLevels] = useState<StockLevel[]>([]);

  // Load initial warehouses
  const loadWarehousesData = useCallback(async () => {
    try {
      const list = await getWarehouses();
      setWarehouses(list);
      if (list.length > 0 && !selectedWarehouse) {
        setSelectedWarehouse(list[0]);
        dispatch(setReduxWarehouses({ fromWarehouseId: list[0].id }));
        if (list.length > 1 && !targetWarehouse) {
          setTargetWarehouse(list[1]);
          dispatch(setReduxWarehouses({ toWarehouseId: list[1].id }));
        }
      }
    } catch {
      // Non-fatal
    }
  }, [selectedWarehouse, targetWarehouse, dispatch]);

  useEffect(() => {
    loadWarehousesData();
  }, [loadWarehousesData]);

  // Handle Tab Switch
  const handleTabSelect = (mode: WarehouseSessionMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch(setMode(mode));

    // When switching to COUNT mode, preload warehouse items into expectedItems
    if (mode === 'COUNT' && selectedWarehouse) {
      loadWarehouseCountItems(selectedWarehouse.id);
    }
  };

  const loadWarehouseCountItems = async (whId: string) => {
    try {
      const levels = await getWarehouseStockLevels(whId);
      const mapped: ExpectedItem[] = levels.map((lvl) => ({
        productId: lvl.productId,
        productCode: lvl.product?.code || 'KODSUZ',
        productName: lvl.product?.name || 'Ürün',
        barcode: lvl.product?.barcode || null,
        expectedQty: lvl.quantity,
        countedQty: 0,
      }));
      dispatch(setExpectedItems(mapped));
    } catch {
      // Non-fatal
    }
  };

  // Search product manually
  const handleSearchSubmit = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const { product, stockLevels } = await lookupProductByBarcode(q);
      if (product) {
        setActiveProduct(product);
        setActiveStockLevels(stockLevels);
        setLookupModalVisible(true);
      } else {
        Alert.alert('Ürün Bulunamadı', `"${q}" aramasına uygun kayıtlı ürün bulunamadı.`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Barcode Scanned Event (from Camera Scanner)
  const handleBarcodeScanned = async (barcode: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (activeMode === 'LOOKUP') {
      setIsSearching(true);
      try {
        const { product, stockLevels } = await lookupProductByBarcode(barcode);
        if (product) {
          setActiveProduct(product);
          setActiveStockLevels(stockLevels);
          setLookupModalVisible(true);
        } else {
          Alert.alert('Ürün Bulunamadı', `"${barcode}" barkodlu ürün sistemde bulunamadı.`);
        }
      } finally {
        setIsSearching(false);
      }
    } else {
      // In COUNT, TRANSFER or DELIVERY mode, add scan to Redux session
      // First try to lookup product metadata to store in scan entry
      const { product } = await lookupProductByBarcode(barcode);

      if (activeMode === 'TRANSFER' && !product) {
        Alert.alert('Ürün Bulunamadı', `"${barcode}" barkodlu ürün bulunamadı. Transfer listesine eklenemedi.`);
        return;
      }

      dispatch(
        addScan({
          barcode,
          productId: product?.id,
          productCode: product?.code,
          productName: product?.name,
          quantity: 1,
        })
      );
    }
  };

  // Open Warehouse Picker Modal
  const openWarehousePicker = (target: 'SOURCE' | 'TARGET') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setWhPickerTarget(target);
    setWhModalVisible(true);
  };

  const handleWarehouseSelected = (wh: Warehouse) => {
    if (whPickerTarget === 'SOURCE') {
      setSelectedWarehouse(wh);
      dispatch(setReduxWarehouses({ fromWarehouseId: wh.id }));
      if (activeMode === 'COUNT') {
        loadWarehouseCountItems(wh.id);
      }
    } else {
      setTargetWarehouse(wh);
      dispatch(setReduxWarehouses({ toWarehouseId: wh.id }));
    }
  };

  // Quick actions from StockLookupModal
  const handleStartCountFromLookup = (product: ProductLookup) => {
    dispatch(setMode('COUNT'));
    if (selectedWarehouse) {
      loadWarehouseCountItems(selectedWarehouse.id);
    }
  };

  const handleStartTransferFromLookup = (product: ProductLookup) => {
    dispatch(setMode('TRANSFER'));
    dispatch(
      addScan({
        barcode: product.barcode || product.code,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity: 1,
      })
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
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Stok & Depo
          </Text>
          <View
            style={[
              styles.whPill,
              { backgroundColor: theme.colors.borderSubtle },
            ]}
          >
            <Ionicons name="business-outline" size={12} color={theme.colors.primary} />
            <Text style={[styles.whPillText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {selectedWarehouse ? selectedWarehouse.name : 'Depo Seçin'}
            </Text>
          </View>
        </View>

        {/* Global Camera Scanner & High Contrast Buttons in Header */}
        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            style={[
              styles.contrastToggleBtn,
              {
                backgroundColor: isHighContrast ? '#FFE600' : theme.colors.surface1,
                borderColor: isHighContrast ? '#FFE600' : theme.colors.glassBorder,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              toggleHighContrast();
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isHighContrast ? 'contrast' : 'contrast-outline'}
              size={15}
              color={isHighContrast ? '#000000' : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.contrastToggleText,
                { color: isHighContrast ? '#000000' : theme.colors.textSecondary },
              ]}
            >
              {isHighContrast ? 'KONTRAST' : 'KONTRAST'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerPrinterBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setPrinterModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="print-outline" size={17} color={theme.colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerCameraBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setScannerVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-outline" size={18} color="#ffffff" />
            <Text style={styles.headerCameraBtnText}>Tara</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Module Segment Tabs Bar ── */}
      <View
        style={[
          styles.segmentTabsWrapper,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderBottomColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segmentTabsScroll}
        >
          {SEGMENT_TABS.map((tab) => {
            const isActive = activeMode === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.7}
                onPress={() => handleTabSelect(tab.key)}
                style={[
                  styles.tabChip,
                  isActive
                    ? [styles.tabChipActive, { backgroundColor: theme.colors.primary }]
                    : { backgroundColor: theme.colors.borderSubtle },
                ]}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? '#ffffff' : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.tabChipText,
                    {
                      color: isActive ? '#ffffff' : theme.colors.textSecondary,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── WMS 2.0 Quick Actions Strip ── */}
      <View
        style={[
          styles.wmsActionsBar,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderBottomColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.wmsActionsScroll}
        >
          <TouchableOpacity
            style={[
              styles.wmsActionChip,
              { backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setShelfModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="grid-outline" size={14} color={theme.colors.primary} />
            <Text style={[styles.wmsActionChipText, { color: theme.colors.primary }]}>
              Raf / Lokasyon Stokları
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.wmsActionChip,
              { backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setPickListVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={14} color={theme.colors.primary} />
            <Text style={[styles.wmsActionChipText, { color: theme.colors.primary }]}>
              Sipariş Toplama (Pick List)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.wmsActionChip,
              { backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setLocationTransferVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="swap-horizontal" size={14} color={theme.colors.primary} />
            <Text style={[styles.wmsActionChipText, { color: theme.colors.primary }]}>
              İç Raf Transferi
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.wmsActionChip,
              { backgroundColor: theme.colors.borderSubtle, borderColor: 'transparent' },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setPrinterModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="print-outline" size={14} color={theme.colors.text} />
            <Text style={[styles.wmsActionChipText, { color: theme.colors.text }]}>
              Yazıcı
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Tab Views Content ── */}
      <View style={styles.contentArea}>
        {/* TAB 1: STOK SORGU */}
        {activeMode === 'LOOKUP' && (
          <View style={styles.lookupContainer}>
            {/* Search Input Box */}
            <View style={styles.searchBarWrapper}>
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
                  placeholder="Barkod, SKU veya ürün adı yazın..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  onSubmitEditing={handleSearchSubmit}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.cameraActionBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => setScannerVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="barcode-outline" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Quick Helper Banner */}
            <TouchableOpacity
              style={[
                styles.scannerHeroBanner,
                {
                  backgroundColor: theme.colors.primaryMuted,
                  borderColor: theme.colors.primary,
                  borderRadius: theme.borderRadius.lg,
                },
              ]}
              onPress={() => setScannerVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.scannerHeroLeft}>
                <View style={[styles.heroIconBadge, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="scan" size={24} color="#ffffff" />
                </View>
                <View style={styles.heroTextCol}>
                  <Text style={[styles.heroTitle, { color: theme.colors.primary }]}>
                    Kamerayla Anlık Barkod Oku
                  </Text>
                  <Text style={[styles.heroDesc, { color: theme.colors.textSecondary }]}>
                    EAN-13, Code 128 veya QR kodu vizöre tutun, stoklar anında gelsin
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
            </TouchableOpacity>

            {/* Loading or Search Indicator */}
            {isSearching ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                  Ürün ve stok seviyeleri sorgulanıyor...
                </Text>
              </View>
            ) : (
              <View style={styles.emptyPromptBox}>
                <Ionicons name="cube-outline" size={54} color={theme.colors.textMuted} />
                <Text style={[styles.emptyPromptTitle, { color: theme.colors.text }]}>
                  Barkod Okutun veya Arama Yapın
                </Text>
                <Text style={[styles.emptyPromptDesc, { color: theme.colors.textMuted }]}>
                  Ürünün tüm depolardaki mevcut, rezerve ve kullanılabilir stok miktarları ile güncel
                  satış/alış fiyatları burada görüntülenecektir.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* TAB 2: HIZLI SAYIM */}
        {activeMode === 'COUNT' && (
          <StockCountSessionView
            warehouse={selectedWarehouse}
            onChangeWarehouse={() => openWarehousePicker('SOURCE')}
            onOpenScanner={() => setScannerVisible(true)}
            onSessionCompleted={() => {
              if (selectedWarehouse) {
                loadWarehouseCountItems(selectedWarehouse.id);
              }
            }}
          />
        )}

        {/* TAB 3: DEPOLAR ARASI TRANSFER */}
        {activeMode === 'TRANSFER' && (
          <StockTransferSessionView
            fromWarehouse={selectedWarehouse}
            toWarehouse={targetWarehouse}
            onChangeFromWarehouse={() => openWarehousePicker('SOURCE')}
            onChangeToWarehouse={() => openWarehousePicker('TARGET')}
            onOpenScanner={() => setScannerVisible(true)}
            onTransferCompleted={() => {
              // Reload stock levels
            }}
          />
        )}

        {/* TAB 4: MAL KABUL & İRSALİYE */}
        {activeMode === 'DELIVERY' && (
          <DeliveryVerificationView onOpenScanner={() => setScannerVisible(true)} />
        )}

        {/* TAB 5: RAF / LOKASYON PLANOGRAMI */}
        {activeMode === 'PLANOGRAM' && (
          <View style={styles.planogramWrapper}>
            <ShelfPlanogramGrid
              warehouseName={selectedWarehouse?.name}
              onStartCountForBin={(_bin) => {
                dispatch(setMode('COUNT'));
                if (selectedWarehouse) {
                  loadWarehouseCountItems(selectedWarehouse.id);
                }
              }}
              onTransferBin={(_bin) => {
                setLocationTransferVisible(true);
              }}
            />
          </View>
        )}
      </View>

      {/* ── Modals ── */}
      {/* Camera Barcode Scanner */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onBarcodeScanned={handleBarcodeScanned}
        title={
          activeMode === 'COUNT'
            ? 'Sayım İçin Barkod Oku'
            : activeMode === 'TRANSFER'
            ? 'Transfer İçin Barkod Oku'
            : activeMode === 'DELIVERY'
            ? 'Mal Kabul Kalem Tara'
            : 'Stok Sorgu Barkod Tara'
        }
      />

      {/* Product Details & Stock Breakdown Modal */}
      <StockLookupModal
        visible={lookupModalVisible}
        product={activeProduct}
        stockLevels={activeStockLevels}
        onClose={() => {
          setLookupModalVisible(false);
          setActiveProduct(null);
          setActiveStockLevels([]);
        }}
        onStartCount={handleStartCountFromLookup}
        onStartTransfer={handleStartTransferFromLookup}
      />

      {/* Warehouse Selector Modal */}
      <WarehouseSelectorModal
        visible={whModalVisible}
        warehouses={warehouses}
        selectedId={whPickerTarget === 'SOURCE' ? selectedWarehouse?.id || null : targetWarehouse?.id || null}
        disabledId={whPickerTarget === 'SOURCE' ? targetWarehouse?.id || null : selectedWarehouse?.id || null}
        title={whPickerTarget === 'SOURCE' ? 'Çıkış Deposu Seçin' : 'Hedef Depo Seçin'}
        onSelect={handleWarehouseSelected}
        onClose={() => setWhModalVisible(false)}
      />

      {/* ── FAZ 15 WMS 2.0 Modals ── */}
      {/* 15.1: Shelf Stock Lookup Modal */}
      <ShelfStockLookupModal
        visible={shelfModalVisible}
        warehouse={selectedWarehouse}
        onClose={() => setShelfModalVisible(false)}
        onStartLocationTransfer={(item, loc) => {
          setTransferStockItem(item);
          setTransferLocation(loc);
          setLocationTransferVisible(true);
        }}
      />

      {/* 15.1: Intra-Warehouse Shelf Transfer Modal */}
      <LocationTransferModal
        visible={locationTransferVisible}
        warehouse={selectedWarehouse}
        initialStock={transferStockItem}
        initialSourceLocation={transferLocation}
        onClose={() => {
          setLocationTransferVisible(false);
          setTransferStockItem(null);
          setTransferLocation(null);
        }}
        onTransferSuccess={() => {
          if (selectedWarehouse && activeMode === 'COUNT') {
            loadWarehouseCountItems(selectedWarehouse.id);
          }
        }}
      />

      {/* 15.2: Order Pick List & Delivery Note Modal */}
      <OrderPickListModal
        visible={pickListVisible}
        warehouse={selectedWarehouse}
        onClose={() => setPickListVisible(false)}
        onDeliveryNoteCreated={(note) => {
          // Handled within modal with receipt print inquiry
        }}
      />

      {/* 15.3: Bluetooth Thermal Printer Settings Modal */}
      <PrinterSettingsModal
        visible={printerModalVisible}
        onClose={() => setPrinterModalVisible(false)}
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
  whPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    maxWidth: 130,
  },
  whPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerPrinterBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  headerCameraBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  wmsActionsBar: {
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  wmsActionsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  wmsActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  wmsActionChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  segmentTabsWrapper: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  segmentTabsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tabChipActive: {},
  tabChipText: {
    fontSize: 12,
  },
  contentArea: {
    flex: 1,
  },
  lookupContainer: {
    flex: 1,
    padding: 16,
    gap: 14,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  cameraActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerHeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1.5,
  },
  scannerHeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  heroIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  heroDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyPromptBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyPromptTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  emptyPromptDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  contrastToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  contrastToggleText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  planogramWrapper: {
    flex: 1,
    padding: 12,
  },
});
