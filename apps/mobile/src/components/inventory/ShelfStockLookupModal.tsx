import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  Location,
  Warehouse,
  StockLevel,
  getWarehouseLocations,
  getLocationStockLevels,
} from '../../services/inventory.service';
import {
  thermalPrinterService,
  generateShelfLabel,
  generateProductLabel,
} from '../../services/thermal-printer.service';
import { BarcodeScannerModal } from '../scanner/BarcodeScannerModal';
import { Badge } from '../common/Badge';

export interface ShelfStockLookupModalProps {
  visible: boolean;
  warehouse: Warehouse | null;
  initialLocation?: Location | null;
  onClose: () => void;
  onStartLocationTransfer?: (stock: StockLevel, location: Location) => void;
}

export const ShelfStockLookupModal: React.FC<ShelfStockLookupModalProps> = ({
  visible,
  warehouse,
  initialLocation,
  onClose,
  onStartLocationTransfer,
}) => {
  const { theme } = useTheme();

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(initialLocation || null);
  const [shelfStocks, setShelfStocks] = useState<StockLevel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Load locations of this warehouse
  const loadLocations = useCallback(async () => {
    if (!warehouse) return;
    try {
      const list = await getWarehouseLocations(warehouse.id);
      setLocations(list);
      if (!selectedLocation && list.length > 0) {
        setSelectedLocation(list[0]);
      }
    } catch {
      // Non-fatal
    }
  }, [warehouse, selectedLocation]);

  // Load stocks for selected shelf
  const loadShelfStocks = useCallback(async (loc: Location) => {
    if (!warehouse) return;
    setIsLoading(true);
    try {
      const stocks = await getLocationStockLevels(warehouse.id, loc.id);
      setShelfStocks(stocks);
    } catch {
      Alert.alert('Hata', 'Raf stokları alınamadı.');
    } finally {
      setIsLoading(false);
    }
  }, [warehouse]);

  useEffect(() => {
    if (visible) {
      loadLocations();
    }
  }, [visible, loadLocations]);

  useEffect(() => {
    if (selectedLocation) {
      loadShelfStocks(selectedLocation);
    } else {
      setShelfStocks([]);
    }
  }, [selectedLocation, loadShelfStocks]);

  // Handle Barcode Scan of Shelf QR
  const handleShelfBarcodeScanned = (barcode: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setScannerVisible(false);

    const clean = barcode.trim().toUpperCase().replace('AXON-LOC:', '');
    const found = locations.find(
      (l) => l.code.toUpperCase() === clean || l.id.toUpperCase() === clean || l.name.toUpperCase().includes(clean)
    );

    if (found) {
      setSelectedLocation(found);
    } else {
      Alert.alert('Lokasyon Bulunamadı', `"${barcode}" kodlu raf bu depoda bulunamadı.`);
    }
  };

  // Print Shelf Label
  const handlePrintShelfLabel = async () => {
    if (!selectedLocation || !warehouse) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsPrinting(true);
    try {
      const { bytes } = generateShelfLabel({
        warehouseName: warehouse.name,
        code: selectedLocation.code,
        name: selectedLocation.name,
        aisle: selectedLocation.aisle,
        shelf: selectedLocation.shelf,
      });

      const res = await thermalPrinterService.print(bytes, `Raf Etiketi - ${selectedLocation.code}`);
      Alert.alert(res.success ? 'Yazdırıldı' : 'Yazıcı Uyarısı', res.message);
    } catch {
      Alert.alert('Hata', 'Yazdırma işlemi gerçekleştirilemedi.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Print Product Label
  const handlePrintProductLabel = async (item: StockLevel) => {
    if (!item.product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const { bytes } = generateProductLabel({
        id: item.product.id,
        code: item.product.code,
        name: item.product.name,
        barcode: item.product.barcode || item.product.code,
        salesPrice: 0,
        purchasePrice: 0,
        minStockLevel: 0,
        isActive: true,
      });

      const res = await thermalPrinterService.print(bytes, `Ürün Etiketi - ${item.product.code}`);
      Alert.alert(res.success ? 'Yazdırıldı' : 'Yazıcı Uyarısı', res.message);
    } catch {
      Alert.alert('Hata', 'Etiket yazdırılamadı.');
    }
  };

  const renderStockItem = ({ item }: { item: StockLevel }) => {
    const qty = Number(item.quantity);
    return (
      <View
        style={[
          styles.stockCard,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.md,
            ...theme.shadows.sm,
          },
        ]}
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardTitleCol}>
            <Text style={[styles.productName, { color: theme.colors.text }]} numberOfLines={1}>
              {item.product?.name || 'İsimsiz Ürün'}
            </Text>
            <Text style={[styles.productMeta, { color: theme.colors.textMuted }]}>
              SKU: {item.product?.code} {item.product?.barcode ? `• Barkod: ${item.product.barcode}` : ''}
            </Text>
          </View>
          <View style={styles.qtyBadgeCol}>
            <Text style={[styles.qtyValue, { color: theme.colors.primary }]}>{qty}</Text>
            <Text style={[styles.qtyUnit, { color: theme.colors.textMuted }]}>AD</Text>
          </View>
        </View>

        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            style={[styles.smallActionBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={() => handlePrintProductLabel(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="print-outline" size={14} color={theme.colors.text} />
            <Text style={[styles.smallActionText, { color: theme.colors.text }]}>Etiket</Text>
          </TouchableOpacity>

          {onStartLocationTransfer && selectedLocation && (
            <TouchableOpacity
              style={[styles.smallActionBtn, { backgroundColor: theme.colors.primaryMuted }]}
              onPress={() => {
                onClose();
                onStartLocationTransfer(item, selectedLocation);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal-outline" size={14} color={theme.colors.primary} />
              <Text style={[styles.smallActionText, { color: theme.colors.primary, fontWeight: '600' }]}>
                Raftan Transfer
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'bottom']}
      >
        {/* Header */}
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
            <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="grid-outline" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Raf / Lokasyon Stokları
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {warehouse?.name || 'Depo Seçilmedi'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.scanBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => setScannerVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="qr-code-outline" size={18} color="#ffffff" />
              <Text style={styles.scanBtnText}>Raf Oku</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Shelf Selector Pills */}
        <View style={[styles.shelfSelectorBar, { backgroundColor: theme.colors.surfaceCard }]}>
          <Text style={[styles.selectorLabel, { color: theme.colors.textMuted }]}>
            LOKASYON / RAF SEÇİN:
          </Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={locations}
            keyExtractor={(loc) => loc.id}
            contentContainerStyle={styles.shelfPillsScroll}
            renderItem={({ item: loc }) => {
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.shelfPill,
                    isSelected
                      ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                      : { backgroundColor: theme.colors.borderSubtle, borderColor: 'transparent' },
                  ]}
                  onPress={() => setSelectedLocation(loc)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.shelfPillText,
                      { color: isSelected ? '#ffffff' : theme.colors.text, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {loc.code}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Selected Shelf Banner */}
        {selectedLocation && (
          <View
            style={[
              styles.selectedShelfBanner,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.bannerInfoCol}>
              <View style={styles.bannerCodeRow}>
                <Text style={[styles.bannerShelfCode, { color: theme.colors.text }]}>
                  {selectedLocation.code}
                </Text>
                <Badge label="AKTİF RAF" variant="success" size="sm" />
              </View>
              <Text style={[styles.bannerShelfName, { color: theme.colors.textMuted }]}>
                {selectedLocation.name}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.printShelfBtn, { backgroundColor: theme.colors.primaryMuted }]}
              onPress={handlePrintShelfLabel}
              disabled={isPrinting}
              activeOpacity={0.8}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <>
                  <Ionicons name="print" size={16} color={theme.colors.primary} />
                  <Text style={[styles.printShelfBtnText, { color: theme.colors.primary }]}>
                    Raf Etiketi
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Stock List */}
        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
              Raftaki ürünler sorgulanıyor...
            </Text>
          </View>
        ) : shelfStocks.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="file-tray-outline" size={54} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              Bu Rafta Ürün Bulunmuyor
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
              {selectedLocation?.code || 'Seçilen'} lokasyonunda kayıtlı pozitif stok seviyesi mevcut değil.
            </Text>
          </View>
        ) : (
          <FlatList
            data={shelfStocks}
            keyExtractor={(s, idx) => s.id || `${s.productId}-${idx}`}
            renderItem={renderStockItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Barcode Scanner Modal */}
        <BarcodeScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onBarcodeScanned={handleShelfBarcodeScanned}
          title="Raf QR / Barkodu Oku"
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  scanBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelfSelectorBar: { paddingVertical: 10, paddingHorizontal: 16, gap: 8 },
  selectorLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  shelfPillsScroll: { gap: 8 },
  shelfPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  shelfPillText: { fontSize: 13 },
  selectedShelfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerInfoCol: { flex: 1, gap: 4 },
  bannerCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerShelfCode: { fontSize: 18, fontWeight: '800' },
  bannerShelfName: { fontSize: 12 },
  printShelfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  printShelfBtnText: { fontSize: 13, fontWeight: '700' },
  listContainer: { padding: 16, gap: 12 },
  stockCard: { padding: 14, borderWidth: 1, gap: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleCol: { flex: 1, marginRight: 8 },
  productName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  productMeta: { fontSize: 12 },
  qtyBadgeCol: { alignItems: 'flex-end' },
  qtyValue: { fontSize: 20, fontWeight: '800' },
  qtyUnit: { fontSize: 10, fontWeight: '600' },
  cardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 10 },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  smallActionText: { fontSize: 12 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 13 },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
