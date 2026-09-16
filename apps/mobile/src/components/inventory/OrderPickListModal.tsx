import React, { useState, useEffect, useMemo } from 'react';
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
import { SalesOrder, getSalesOrders } from '../../services/sales.service';
import {
  Warehouse,
  DeliveryNote,
  createDeliveryNoteFromPickList,
} from '../../services/inventory.service';
import {
  thermalPrinterService,
  generateOrderReceipt,
} from '../../services/thermal-printer.service';
import { BarcodeScannerModal } from '../scanner/BarcodeScannerModal';
import { Badge } from '../common/Badge';
import { formatCurrency } from '../../lib/utils';

export interface OrderPickListModalProps {
  visible: boolean;
  warehouse: Warehouse | null;
  onClose: () => void;
  onDeliveryNoteCreated?: (note: DeliveryNote) => void;
}

interface PickItemState {
  productId: string;
  salesOrderItemId?: string;
  productName: string;
  productCode: string;
  barcode: string | null;
  locationCode: string;
  orderedQty: number;
  pickedQty: number;
  unitPrice: number;
}

export const OrderPickListModal: React.FC<OrderPickListModalProps> = ({
  visible,
  warehouse,
  onClose,
  onDeliveryNoteCreated,
}) => {
  const { theme } = useTheme();

  // Orders list state
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Active picking session
  const [activeOrder, setActiveOrder] = useState<SalesOrder | null>(null);
  const [pickItems, setPickItems] = useState<PickItemState[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Scanner Modal
  const [scannerVisible, setScannerVisible] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  // Load orders waiting for picking
  useEffect(() => {
    if (visible) {
      loadPendingOrders();
    } else {
      setActiveOrder(null);
      setPickItems([]);
    }
  }, [visible]);

  const loadPendingOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const res = await getSalesOrders({ limit: 20 });
      // Filter orders that are ready for picking (CONFIRMED, PARTIALLY_DELIVERED)
      const pending = res.items.filter(
        (o) => o.status === 'CONFIRMED' || o.status === 'PARTIALLY_DELIVERED'
      );
      setOrders(pending.length > 0 ? pending : res.items);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // Start picking session for an order
  const handleStartPicking = (order: SalesOrder) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Map order items and assign optimized picking sequence
    const rawItems: PickItemState[] = (order.items || []).map((item, idx) => {
      // Simulated or assigned location code (e.g. A-01, A-03, B-02) based on SKU
      const charCode = (item.product?.code || 'A01').charCodeAt(0) % 4;
      const aisle = ['A', 'B', 'C', 'D'][charCode];
      const shelfNum = ((idx + 1) * 2).toString().padStart(2, '0');
      const locCode = `${aisle}-${shelfNum}`;

      return {
        productId: item.productId,
        salesOrderItemId: item.id,
        productName: item.product?.name || 'Ürün',
        productCode: item.product?.code || 'KOD',
        barcode: item.product?.barcode || null,
        locationCode: locCode,
        orderedQty: item.quantity,
        pickedQty: 0,
        unitPrice: item.unitPrice,
      };
    });

    // Sort by location code for optimal warehouse path (A-01 -> A-02 -> B-01 ...)
    const sorted = [...rawItems].sort((a, b) => a.locationCode.localeCompare(b.locationCode));

    setActiveOrder(order);
    setPickItems(sorted);
    setActiveItemIndex(0);
  };

  // Progress calculations
  const totalOrdered = useMemo(
    () => pickItems.reduce((acc, i) => acc + i.orderedQty, 0),
    [pickItems]
  );
  const totalPicked = useMemo(
    () => pickItems.reduce((acc, i) => acc + i.pickedQty, 0),
    [pickItems]
  );
  const progressPercent = totalOrdered > 0 ? Math.round((totalPicked / totalOrdered) * 100) : 0;
  const isFullyPicked = totalOrdered > 0 && totalPicked >= totalOrdered;

  // Handle manual increment/decrement
  const handleItemIncrement = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPickItems((prev) =>
      prev.map((item, idx) => {
        if (idx === index) {
          const next = Math.min(item.orderedQty, item.pickedQty + 1);
          return { ...item, pickedQty: next };
        }
        return item;
      })
    );
  };

  const handleItemDecrement = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPickItems((prev) =>
      prev.map((item, idx) => {
        if (idx === index) {
          const next = Math.max(0, item.pickedQty - 1);
          return { ...item, pickedQty: next };
        }
        return item;
      })
    );
  };

  // Handle barcode scanned during picking session
  const handleBarcodeScanned = (barcode: string) => {
    setScannerVisible(false);
    const clean = barcode.trim().toLowerCase();

    // Check if matches active item or any item
    const matchedIndex = pickItems.findIndex(
      (item) =>
        item.barcode?.toLowerCase() === clean ||
        item.productCode.toLowerCase() === clean ||
        clean.includes(item.productCode.toLowerCase())
    );

    if (matchedIndex !== -1) {
      const target = pickItems[matchedIndex];
      if (target.pickedQty >= target.orderedQty) {
        Alert.alert('Tamamlandı', `"${target.productName}" için gereken miktar zaten toplandı.`);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPickItems((prev) =>
        prev.map((item, idx) => (idx === matchedIndex ? { ...item, pickedQty: item.pickedQty + 1 } : item))
      );

      // Move to next unpicked item
      const nextUnpicked = pickItems.findIndex(
        (i, idx) => idx > matchedIndex && i.pickedQty < i.orderedQty
      );
      if (nextUnpicked !== -1) {
        setActiveItemIndex(nextUnpicked);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        'Hatalı Ürün!',
        `"${barcode}" barkodlu ürün bu siparişin toplama listesinde bulunmuyor veya yanlış barkod okutuldu.`
      );
    }
  };

  // Complete picking & Create Delivery Note
  const handleCreateDeliveryNote = async () => {
    if (!activeOrder || !warehouse) return;

    if (totalPicked === 0) {
      Alert.alert('Uyarı', 'Henüz hiçbir ürün toplanmadı.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setIsDispatching(true);
    try {
      const createdNote = await createDeliveryNoteFromPickList({
        salesOrderId: activeOrder.id,
        warehouseId: warehouse.id,
        contactId: activeOrder.contactId,
        notes: `Mobil Toplama Emri Sevk İrsaliyesi - Sipariş: ${activeOrder.number || activeOrder.id.slice(0, 8)}`,
        items: pickItems
          .filter((i) => i.pickedQty > 0)
          .map((i) => ({
            productId: i.productId,
            salesOrderItemId: i.salesOrderItemId,
            orderedQty: i.orderedQty,
            deliveredQty: i.pickedQty,
          })),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // Auto print receipt inquiry
      Alert.alert(
        'Sevk İrsaliyesi Oluşturuldu! 🚚',
        `İrsaliye No: ${createdNote.number}\nToplam ${totalPicked} adet ürün sevkiyata hazırlandı.\n\nTermal sevk fişi basılsın mı?`,
        [
          {
            text: 'Yazdırma',
            style: 'cancel',
            onPress: () => {
              setActiveOrder(null);
              onDeliveryNoteCreated?.(createdNote);
              onClose();
            },
          },
          {
            text: 'Fiş Yazdır',
            style: 'default',
            onPress: async () => {
              try {
                const { bytes } = generateOrderReceipt(activeOrder);
                await thermalPrinterService.print(bytes, `Sevk Fişi - ${createdNote.number}`);
              } catch {
                // Non-fatal
              } finally {
                setActiveOrder(null);
                onDeliveryNoteCreated?.(createdNote);
                onClose();
              }
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || err?.message || 'İrsaliye oluşturulamadı.');
    } finally {
      setIsDispatching(false);
    }
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
              <Ionicons name="clipboard-outline" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                {activeOrder ? 'Sipariş Toplama (Pick List)' : 'Hazırlanacak Siparişler'}
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {warehouse?.name || 'Depo Seçin'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={() => {
              if (activeOrder) {
                Alert.alert(
                  'Toplama Oturumundan Çık',
                  'Toplama işlemi henüz tamamlanmadı. Çıkmak istediğinize emin misiniz?',
                  [
                    { text: 'Devam Et', style: 'cancel' },
                    { text: 'Çık', style: 'destructive', onPress: () => setActiveOrder(null) },
                  ]
                );
              } else {
                onClose();
              }
            }}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* ── SCREEN 1: Orders List ── */}
        {!activeOrder && (
          <View style={styles.viewContainer}>
            <View style={[styles.ordersPromptBar, { backgroundColor: theme.colors.surfaceCard }]}>
              <Ionicons name="information-circle-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.ordersPromptText, { color: theme.colors.textSecondary }]}>
                Toplama ve sevkiyat doğrulaması yapmak istediğiniz siparişi seçin:
              </Text>
            </View>

            {isLoadingOrders ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                  Siparişler listeleniyor...
                </Text>
              </View>
            ) : orders.length === 0 ? (
              <View style={styles.centerBox}>
                <Ionicons name="checkmark-done-circle-outline" size={54} color={theme.colors.success} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                  Bekleyen Toplama Emri Yok
                </Text>
                <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                  Hazırlanacak açık veya onaylı satış siparişi bulunamadı.
                </Text>
              </View>
            ) : (
              <FlatList
                data={orders}
                keyExtractor={(o) => o.id}
                contentContainerStyle={styles.ordersList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: order }) => {
                  const itemCount = order.items?.length || 0;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.orderCard,
                        {
                          backgroundColor: theme.colors.surfaceCard,
                          borderColor: theme.colors.borderSubtle,
                          borderRadius: theme.borderRadius.lg,
                          ...theme.shadows.sm,
                        },
                      ]}
                      onPress={() => handleStartPicking(order)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.orderCardHeader}>
                        <View style={styles.orderNumberCol}>
                          <Text style={[styles.orderNumber, { color: theme.colors.text }]}>
                            {order.number || order.id.slice(0, 8)}
                          </Text>
                          <Text style={[styles.customerName, { color: theme.colors.textMuted }]}>
                            {order.contact?.name || 'İsimsiz Müşteri'}
                          </Text>
                        </View>
                        <Badge label={order.status} variant="info" size="sm" />
                      </View>

                      <View style={[styles.cardDivider, { backgroundColor: theme.colors.borderSubtle }]} />

                      <View style={styles.orderCardFooter}>
                        <View style={styles.footerItem}>
                          <Ionicons name="cube-outline" size={14} color={theme.colors.textMuted} />
                          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
                            {itemCount} Kalem
                          </Text>
                        </View>
                        <View style={styles.footerItem}>
                          <Ionicons name="cash-outline" size={14} color={theme.colors.textMuted} />
                          <Text style={[styles.footerText, { color: theme.colors.primary, fontWeight: '700' }]}>
                            {formatCurrency(order.totalGross)}
                          </Text>
                        </View>
                        <View style={[styles.startPickBadge, { backgroundColor: theme.colors.primary }]}>
                          <Text style={styles.startPickText}>Topla</Text>
                          <Ionicons name="chevron-forward" size={14} color="#ffffff" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}

        {/* ── SCREEN 2: Active Picking Session ── */}
        {activeOrder && (
          <View style={styles.viewContainer}>
            {/* Session Progress Header */}
            <View
              style={[
                styles.sessionHeaderBanner,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderBottomColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.progressTopRow}>
                <View>
                  <Text style={[styles.sessionOrderNum, { color: theme.colors.text }]}>
                    {activeOrder.number || activeOrder.id.slice(0, 8)}
                  </Text>
                  <Text style={[styles.sessionCustomer, { color: theme.colors.textMuted }]}>
                    {activeOrder.contact?.name}
                  </Text>
                </View>
                <View style={styles.progressPercentCol}>
                  <Text style={[styles.percentValue, { color: isFullyPicked ? theme.colors.success : theme.colors.primary }]}>
                    %{progressPercent}
                  </Text>
                  <Text style={[styles.percentLabel, { color: theme.colors.textMuted }]}>
                    {totalPicked} / {totalOrdered} Adet
                  </Text>
                </View>
              </View>

              {/* Progress Bar Line */}
              <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.borderSubtle }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, progressPercent)}%`,
                      backgroundColor: isFullyPicked ? theme.colors.success : theme.colors.primary,
                    },
                  ]}
                />
              </View>

              {/* Optimized Route Guide Banner */}
              {pickItems.length > 0 && !isFullyPicked && (
                <View
                  style={[
                    styles.routeGuideBox,
                    {
                      backgroundColor: theme.colors.primaryMuted,
                      borderColor: theme.colors.primary,
                    },
                  ]}
                >
                  <Ionicons name="navigate-outline" size={20} color={theme.colors.primary} />
                  <View style={styles.routeGuideCol}>
                    <Text style={[styles.routeGuideTitle, { color: theme.colors.primary }]}>
                      Sıradaki Rota: Raf {pickItems[activeItemIndex]?.locationCode || 'A-01'}
                    </Text>
                    <Text style={[styles.routeGuideDesc, { color: theme.colors.textSecondary }]}>
                      {pickItems[activeItemIndex]?.productName} ({pickItems[activeItemIndex]?.orderedQty} Adet)
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Picking Items List */}
            <FlatList
              data={pickItems}
              keyExtractor={(i, idx) => `${i.productId}-${idx}`}
              contentContainerStyle={styles.pickListContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const isComplete = item.pickedQty >= item.orderedQty;
                return (
                  <View
                    style={[
                      styles.pickItemCard,
                      {
                        backgroundColor: theme.colors.surfaceCard,
                        borderColor: isComplete ? theme.colors.success : theme.colors.borderSubtle,
                        borderWidth: isComplete ? 1.5 : 1,
                        borderRadius: theme.borderRadius.md,
                      },
                    ]}
                  >
                    <View style={styles.pickItemTopRow}>
                      <View style={[styles.shelfBadge, { backgroundColor: theme.colors.primaryMuted }]}>
                        <Ionicons name="grid-outline" size={12} color={theme.colors.primary} />
                        <Text style={[styles.shelfBadgeText, { color: theme.colors.primary }]}>
                          Raf {item.locationCode}
                        </Text>
                      </View>

                      {isComplete ? (
                        <View style={[styles.statusTikBadge, { backgroundColor: theme.colors.success }]}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                          <Text style={styles.statusTikText}>Toplandı</Text>
                        </View>
                      ) : (
                        <Badge label="Bekliyor" variant="neutral" size="sm" />
                      )}
                    </View>

                    <View style={styles.productDetailsRow}>
                      <View style={styles.productDetailsCol}>
                        <Text style={[styles.pickItemName, { color: theme.colors.text }]}>
                          {item.productName}
                        </Text>
                        <Text style={[styles.pickItemSku, { color: theme.colors.textMuted }]}>
                          SKU: {item.productCode} {item.barcode ? `• Barkod: ${item.barcode}` : ''}
                        </Text>
                      </View>

                      {/* Stepper controls */}
                      <View style={styles.pickStepperRow}>
                        <TouchableOpacity
                          style={[styles.stepperSmallBtn, { backgroundColor: theme.colors.borderSubtle }]}
                          onPress={() => handleItemDecrement(index)}
                        >
                          <Ionicons name="remove" size={16} color={theme.colors.text} />
                        </TouchableOpacity>

                        <Text style={[styles.pickCountText, { color: isComplete ? theme.colors.success : theme.colors.text }]}>
                          {item.pickedQty} / {item.orderedQty}
                        </Text>

                        <TouchableOpacity
                          style={[
                            styles.stepperSmallBtn,
                            { backgroundColor: isComplete ? theme.colors.borderSubtle : theme.colors.primary },
                          ]}
                          onPress={() => handleItemIncrement(index)}
                          disabled={isComplete}
                        >
                          <Ionicons name="add" size={16} color={isComplete ? theme.colors.textMuted : '#ffffff'} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }}
            />

            {/* Sticky Action Bottom Bar */}
            <View
              style={[
                styles.bottomActionBar,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderTopColor: theme.colors.borderSubtle,
                },
              ]}
            >
              {/* Scan Barcode CTA */}
              <TouchableOpacity
                style={[styles.scanBarBtn, { backgroundColor: theme.colors.borderSubtle }]}
                onPress={() => setScannerVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
                <Text style={[styles.scanBarBtnText, { color: theme.colors.text }]}>Barkod Oku</Text>
              </TouchableOpacity>

              {/* Complete & Create Delivery Note CTA */}
              <TouchableOpacity
                style={[
                  styles.dispatchBtn,
                  {
                    backgroundColor: isFullyPicked ? theme.colors.success : theme.colors.primary,
                    opacity: totalPicked === 0 ? 0.5 : 1,
                  },
                ]}
                disabled={totalPicked === 0 || isDispatching}
                onPress={handleCreateDeliveryNote}
                activeOpacity={0.8}
              >
                {isDispatching ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#ffffff" />
                    <Text style={styles.dispatchBtnText}>
                      {isFullyPicked ? 'Sevk İrsaliyesi Oluştur' : 'Kısmi Sevk Et'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Camera Scanner Modal for Picking */}
        <BarcodeScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onBarcodeScanned={handleBarcodeScanned}
          title="Toplama İçin Ürün Barkodunu Oku"
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewContainer: { flex: 1 },
  ordersPromptBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ordersPromptText: { fontSize: 12, flex: 1 },
  ordersList: { padding: 16, gap: 12 },
  orderCard: { padding: 16, borderWidth: 1, gap: 12 },
  orderCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumberCol: { gap: 2 },
  orderNumber: { fontSize: 16, fontWeight: '800' },
  customerName: { fontSize: 13 },
  cardDivider: { height: 1 },
  orderCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { fontSize: 13 },
  startPickBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  startPickText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  sessionHeaderBanner: { padding: 16, borderBottomWidth: 1, gap: 12 },
  progressTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionOrderNum: { fontSize: 18, fontWeight: '800' },
  sessionCustomer: { fontSize: 13, marginTop: 1 },
  progressPercentCol: { alignItems: 'flex-end' },
  percentValue: { fontSize: 20, fontWeight: '800' },
  percentLabel: { fontSize: 11, fontWeight: '600' },
  progressBarTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  routeGuideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  routeGuideCol: { flex: 1 },
  routeGuideTitle: { fontSize: 13, fontWeight: '800' },
  routeGuideDesc: { fontSize: 11, marginTop: 1 },
  pickListContent: { padding: 16, gap: 12 },
  pickItemCard: { padding: 14, gap: 10 },
  pickItemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shelfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  shelfBadgeText: { fontSize: 11, fontWeight: '700' },
  statusTikBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusTikText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  productDetailsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productDetailsCol: { flex: 1, marginRight: 10 },
  pickItemName: { fontSize: 14, fontWeight: '700' },
  pickItemSku: { fontSize: 11, marginTop: 2 },
  pickStepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperSmallBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickCountText: { fontSize: 15, fontWeight: '800', minWidth: 40, textAlign: 'center' },
  bottomActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  scanBarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  scanBarBtnText: { fontSize: 14, fontWeight: '700' },
  dispatchBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  dispatchBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 13 },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
