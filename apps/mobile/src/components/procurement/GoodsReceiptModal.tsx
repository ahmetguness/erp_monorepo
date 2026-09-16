import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  PurchaseOrder,
  Warehouse,
  getWarehouses,
  receiveGoods,
} from '../../services/procurement.service';
import { formatDate } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  visible: boolean;
  order: PurchaseOrder | null;
  onClose: () => void;
  onGoodsReceived: () => void;
}

interface ReceivingItemState {
  itemId: string;
  productName: string;
  orderedQty: number;
  alreadyReceivedQty: number;
  remainingQty: number;
  currentReceiptQty: number;
}

export const GoodsReceiptModal: React.FC<Props> = ({
  visible,
  order,
  onClose,
  onGoodsReceived,
}) => {
  const { theme } = useTheme();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [receivingItems, setReceivingItems] = useState<ReceivingItemState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && order) {
      // Load warehouses
      getWarehouses().then((whs) => {
        setWarehouses(whs);
        if (whs.length > 0) {
          const defaultWh = whs.find((w) => w.isDefault) || whs[0];
          setSelectedWarehouseId(defaultWh.id);
        }
      });

      // Initialize item lines with remaining quantity
      const lines: ReceivingItemState[] = (order.items || []).map((it) => {
        const remaining = Math.max(0, it.quantity - (it.received || 0));
        return {
          itemId: it.id,
          productName: it.product?.name || it.description || 'Ürün',
          orderedQty: it.quantity,
          alreadyReceivedQty: it.received || 0,
          remainingQty: remaining,
          currentReceiptQty: remaining, // default to receiving the remaining quantity
        };
      });
      setReceivingItems(lines);
      setIsSubmitting(false);
    }
  }, [visible, order]);

  if (!order) return null;

  const handleUpdateQty = (itemId: string, qty: number) => {
    setReceivingItems((prev) =>
      prev.map((i) =>
        i.itemId === itemId ? { ...i, currentReceiptQty: Math.max(0, qty) } : i
      )
    );
  };

  const handleFillAllRemaining = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setReceivingItems((prev) =>
      prev.map((i) => ({ ...i, currentReceiptQty: i.remainingQty }))
    );
  };

  const totalCurrentReceipt = receivingItems.reduce(
    (sum, i) => sum + (i.currentReceiptQty || 0),
    0
  );

  const handleSubmit = async () => {
    if (!selectedWarehouseId) {
      Alert.alert('Depo Seçiniz', 'Lütfen teslim alınan ürünlerin gireceği depoyu seçin.');
      return;
    }

    if (totalCurrentReceipt <= 0) {
      Alert.alert(
        'Miktar Sıfır',
        'En az bir ürün kalemi için sıfırdan büyük teslim alma miktarı girmelisiniz.'
      );
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      await receiveGoods(order.id, {
        warehouseId: selectedWarehouseId,
        items: receivingItems
          .filter((i) => i.currentReceiptQty > 0)
          .map((i) => ({
            itemId: i.itemId,
            receivedQty: i.currentReceiptQty,
          })),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Mal Kabul Tamamlandı',
        `"${order.number}" numaralı siparişe ait ${totalCurrentReceipt} adet ürün stoğa kaydedildi.`
      );
      onGoodsReceived();
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Mal kabul işlemi gerçekleştirilemedi.');
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
          <View>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                PO Mal Kabul & Depoya Giriş
              </Text>
              <Badge label="3-Way Match" variant="info" size="sm" />
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {order.number} • {order.contact?.name || 'Tedarikçi'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Target Warehouse Selection */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
              GİRİŞ YAPILACAK DEPO
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.whRow}>
              {warehouses.map((wh) => {
                const isSelected = selectedWarehouseId === wh.id;
                return (
                  <TouchableOpacity
                    key={wh.id}
                    style={[
                      styles.whChip,
                      {
                        backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                    onPress={() => setSelectedWarehouseId(wh.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={14}
                      color={isSelected ? '#ffffff' : theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.whChipText,
                        { color: isSelected ? '#ffffff' : theme.colors.text },
                      ]}
                    >
                      {wh.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Items Receiving Stepper */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.itemsHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
                TESLİM ALINAN KALEMLER ({receivingItems.length})
              </Text>
              <TouchableOpacity
                style={[styles.autoFillBtn, { backgroundColor: theme.colors.primaryMuted }]}
                onPress={handleFillAllRemaining}
                activeOpacity={0.7}
              >
                <Ionicons name="flash-outline" size={13} color={theme.colors.primary} />
                <Text style={[styles.autoFillText, { color: theme.colors.primary }]}>
                  Kalanı Doldur
                </Text>
              </TouchableOpacity>
            </View>

            {receivingItems.map((item, idx) => {
              const isOverReceiving = item.currentReceiptQty > item.remainingQty;

              return (
                <View
                  key={item.itemId}
                  style={[
                    styles.itemBox,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: isOverReceiving ? '#ef4444' : theme.colors.borderSubtle,
                    },
                  ]}
                >
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <Text style={[styles.itemSummary, { color: theme.colors.textMuted }]}>
                      Sipariş: {item.orderedQty} | Alınan: {item.alreadyReceivedQty} | Kalan: {item.remainingQty}
                    </Text>
                  </View>

                  {/* Quantity Stepper & Manual Input */}
                  <View style={styles.stepperRow}>
                    <Text style={[styles.stepperLabel, { color: theme.colors.textSecondary }]}>
                      Bu Teslimatta Gelen:
                    </Text>

                    <View style={styles.stepperWrap}>
                      <TouchableOpacity
                        style={[styles.stepBtn, { backgroundColor: theme.colors.borderSubtle }]}
                        onPress={() => handleUpdateQty(item.itemId, item.currentReceiptQty - 1)}
                      >
                        <Ionicons name="remove" size={16} color={theme.colors.text} />
                      </TouchableOpacity>

                      <TextInput
                        style={[
                          styles.stepInput,
                          {
                            backgroundColor: theme.colors.surfaceCard,
                            color: theme.colors.text,
                            borderColor: theme.colors.border,
                          },
                        ]}
                        keyboardType="numeric"
                        value={String(item.currentReceiptQty)}
                        onChangeText={(val) => handleUpdateQty(item.itemId, parseInt(val, 10) || 0)}
                      />

                      <TouchableOpacity
                        style={[styles.stepBtn, { backgroundColor: theme.colors.primary }]}
                        onPress={() => handleUpdateQty(item.itemId, item.currentReceiptQty + 1)}
                      >
                        <Ionicons name="add" size={16} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {isOverReceiving && (
                    <Text style={styles.warningText}>
                      ⚠️ Dikkat: Girilen miktar kalan sipariş adedinden ({item.remainingQty}) fazladır.
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Footer */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <View style={styles.footerTotalCol}>
            <Text style={[styles.footerTotalLabel, { color: theme.colors.textMuted }]}>
              TOPLAM MAL KABUL
            </Text>
            <Text style={[styles.footerTotalVal, { color: theme.colors.primary }]}>
              {totalCurrentReceipt} Adet
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor: totalCurrentReceipt > 0 ? '#10b981' : theme.colors.borderSubtle,
              },
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting || totalCurrentReceipt <= 0}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-done-circle" size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>Stoğa Al</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  whRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  whChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  whChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  autoFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  autoFillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginTop: 6,
  },
  itemHeader: {
    gap: 2,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemSummary: {
    fontSize: 11,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInput: {
    minWidth: 48,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    padding: 0,
  },
  warningText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 16,
  },
  footerTotalCol: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footerTotalVal: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
