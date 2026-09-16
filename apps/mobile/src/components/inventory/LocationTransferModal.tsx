import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
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
  transferStockBetweenLocations,
} from '../../services/inventory.service';

export interface LocationTransferModalProps {
  visible: boolean;
  warehouse: Warehouse | null;
  initialStock?: StockLevel | null;
  initialSourceLocation?: Location | null;
  onClose: () => void;
  onTransferSuccess: () => void;
}

export const LocationTransferModal: React.FC<LocationTransferModalProps> = ({
  visible,
  warehouse,
  initialStock,
  initialSourceLocation,
  onClose,
  onTransferSuccess,
}) => {
  const { theme } = useTheme();

  const [locations, setLocations] = useState<Location[]>([]);
  const [sourceLocation, setSourceLocation] = useState<Location | null>(initialSourceLocation || null);
  const [targetLocation, setTargetLocation] = useState<Location | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && warehouse) {
      getWarehouseLocations(warehouse.id).then((list) => {
        setLocations(list);
        if (initialSourceLocation) {
          setSourceLocation(initialSourceLocation);
          const other = list.find((l) => l.id !== initialSourceLocation.id);
          if (other) setTargetLocation(other);
        } else if (list.length >= 2) {
          setSourceLocation(list[0]);
          setTargetLocation(list[1]);
        }
      });
    }
  }, [visible, warehouse, initialSourceLocation]);

  const maxQty = initialStock ? Number(initialStock.quantity) : 9999;

  const handleSetQty = (qty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const clamped = Math.max(1, Math.min(maxQty, qty));
    setQuantity(String(clamped));
  };

  const handleTransfer = async () => {
    if (!warehouse) {
      Alert.alert('Hata', 'Depo seçilmedi.');
      return;
    }
    if (!initialStock?.productId) {
      Alert.alert('Hata', 'Transfer edilecek ürün bulunamadı.');
      return;
    }
    if (!sourceLocation || !targetLocation) {
      Alert.alert('Eksik Bilgi', 'Lütfen kaynak raf ve hedef rafı seçin.');
      return;
    }
    if (sourceLocation.id === targetLocation.id) {
      Alert.alert('Geçersiz İşlem', 'Kaynak ve hedef raf aynı olamaz.');
      return;
    }

    const numQty = parseFloat(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      Alert.alert('Geçersiz Miktar', 'Lütfen geçerli bir miktar girin.');
      return;
    }
    if (numQty > maxQty) {
      Alert.alert('Yetersiz Stok', `Kaynak rafta sadece ${maxQty} adet ürün mevcuttur.`);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSubmitting(true);
    try {
      await transferStockBetweenLocations({
        warehouseId: warehouse.id,
        productId: initialStock.productId,
        fromLocationId: sourceLocation.id,
        toLocationId: targetLocation.id,
        quantity: numQty,
        notes: notes.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Transfer Başarılı',
        `${numQty} adet ürün "${sourceLocation.code}" rafından "${targetLocation.code}" rafına başarıyla aktarıldı.`,
        [{ text: 'Tamam', onPress: () => { onClose(); onTransferSuccess(); } }]
      );
    } catch (err: any) {
      Alert.alert('Transfer Başarısız', err?.response?.data?.message || err?.message || 'İşlem gerçekleştirilemedi.');
    } finally {
      setIsSubmitting(false);
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
              <Ionicons name="swap-horizontal" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Raftan Rafa Transfer
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {warehouse?.name}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Product Banner */}
          {initialStock?.product && (
            <View
              style={[
                styles.productBanner,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
            >
              <View style={styles.productBannerLeft}>
                <Ionicons name="cube-outline" size={28} color={theme.colors.primary} />
                <View style={styles.productBannerInfo}>
                  <Text style={[styles.productName, { color: theme.colors.text }]}>
                    {initialStock.product.name}
                  </Text>
                  <Text style={[styles.productSku, { color: theme.colors.textMuted }]}>
                    SKU: {initialStock.product.code}
                  </Text>
                </View>
              </View>
              <View style={styles.productBannerRight}>
                <Text style={[styles.currentStockVal, { color: theme.colors.primary }]}>
                  {maxQty}
                </Text>
                <Text style={[styles.currentStockLbl, { color: theme.colors.textMuted }]}>
                  Mevcut Stok
                </Text>
              </View>
            </View>
          )}

          {/* Transfer Route Visualizer */}
          <View
            style={[
              styles.routeCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            {/* Source Shelf Picker */}
            <View style={styles.shelfBlock}>
              <View style={styles.shelfBlockHeader}>
                <Ionicons name="log-out-outline" size={16} color={theme.colors.danger} />
                <Text style={[styles.shelfBlockTitle, { color: theme.colors.textMuted }]}>
                  ÇIKIŞ RAFI (KAYNAK)
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
                {locations.map((loc) => {
                  const isSel = sourceLocation?.id === loc.id;
                  return (
                    <TouchableOpacity
                      key={`src-${loc.id}`}
                      style={[
                        styles.locPill,
                        isSel
                          ? { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger }
                          : { backgroundColor: theme.colors.borderSubtle, borderColor: 'transparent' },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSourceLocation(loc);
                      }}
                    >
                      <Text style={[styles.locPillText, { color: isSel ? '#ffffff' : theme.colors.text }]}>
                        {loc.code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Down Arrow Divider */}
            <View style={styles.arrowRow}>
              <View style={[styles.arrowLine, { backgroundColor: theme.colors.borderSubtle }]} />
              <View style={[styles.arrowBadge, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="arrow-down" size={16} color={theme.colors.primary} />
              </View>
              <View style={[styles.arrowLine, { backgroundColor: theme.colors.borderSubtle }]} />
            </View>

            {/* Target Shelf Picker */}
            <View style={styles.shelfBlock}>
              <View style={styles.shelfBlockHeader}>
                <Ionicons name="log-in-outline" size={16} color={theme.colors.success} />
                <Text style={[styles.shelfBlockTitle, { color: theme.colors.textMuted }]}>
                  GİRİŞ RAFI (HEDEF)
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
                {locations.map((loc) => {
                  const isSel = targetLocation?.id === loc.id;
                  const isSource = sourceLocation?.id === loc.id;
                  return (
                    <TouchableOpacity
                      key={`tgt-${loc.id}`}
                      disabled={isSource}
                      style={[
                        styles.locPill,
                        isSel
                          ? { backgroundColor: theme.colors.success, borderColor: theme.colors.success }
                          : isSource
                          ? { backgroundColor: theme.colors.borderSubtle, opacity: 0.3, borderColor: 'transparent' }
                          : { backgroundColor: theme.colors.borderSubtle, borderColor: 'transparent' },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setTargetLocation(loc);
                      }}
                    >
                      <Text style={[styles.locPillText, { color: isSel ? '#ffffff' : theme.colors.text }]}>
                        {loc.code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Quantity Selector */}
          <View
            style={[
              styles.qtyCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Transfer Miktarı</Text>

            <View style={styles.qtyInputRow}>
              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: theme.colors.borderSubtle }]}
                onPress={() => handleSetQty(parseFloat(quantity || '0') - 1)}
              >
                <Ionicons name="remove" size={20} color={theme.colors.text} />
              </TouchableOpacity>

              <TextInput
                style={[
                  styles.qtyInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.borderSubtle,
                  },
                ]}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                textAlign="center"
              />

              <TouchableOpacity
                style={[styles.stepperBtn, { backgroundColor: theme.colors.borderSubtle }]}
                onPress={() => handleSetQty(parseFloat(quantity || '0') + 1)}
              >
                <Ionicons name="add" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {/* Quick Preset Buttons */}
            <View style={styles.presetButtonsRow}>
              {[1, 5, 10, maxQty].map((pVal, idx) => (
                <TouchableOpacity
                  key={`preset-${idx}`}
                  style={[styles.presetBtn, { backgroundColor: theme.colors.primaryMuted }]}
                  onPress={() => handleSetQty(pVal)}
                >
                  <Text style={[styles.presetBtnText, { color: theme.colors.primary }]}>
                    {idx === 3 ? 'Tümü' : `+${pVal}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes Input */}
          <View
            style={[
              styles.notesCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Transfer Notu (Opsiyonel)</Text>
            <TextInput
              style={[
                styles.notesInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
              placeholder="Örn: Düzenleme amacıyla A1'den B2'ye taşındı..."
              placeholderTextColor={theme.colors.textMuted}
              value={notes}
              onChangeText={setNotes}
            />
          </View>
        </ScrollView>

        {/* Action Footer */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
            disabled={isSubmitting}
          >
            <Text style={[styles.cancelBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleTransfer}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                <Text style={styles.confirmBtnText}>Transferi Gerçekleştir</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  content: { padding: 16, gap: 14 },
  productBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1,
  },
  productBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  productBannerInfo: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '700' },
  productSku: { fontSize: 12, marginTop: 2 },
  productBannerRight: { alignItems: 'flex-end' },
  currentStockVal: { fontSize: 20, fontWeight: '800' },
  currentStockLbl: { fontSize: 10, fontWeight: '600' },
  routeCard: { padding: 14, borderWidth: 1, gap: 12 },
  shelfBlock: { gap: 8 },
  shelfBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shelfBlockTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  pillsScroll: { gap: 8 },
  locPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  locPillText: { fontSize: 13, fontWeight: '600' },
  arrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrowLine: { flex: 1, height: 1 },
  arrowBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCard: { padding: 14, borderWidth: 1, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  qtyInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    width: 100,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 20,
    fontWeight: '800',
  },
  presetButtonsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnText: { fontSize: 13, fontWeight: '700' },
  notesCard: { padding: 14, borderWidth: 1, gap: 10 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  confirmBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
