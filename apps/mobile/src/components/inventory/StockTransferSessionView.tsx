import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/redux';
import {
  setTransferCartItemQty,
  removeTransferCartItem,
  clearTransferCart,
  selectTransferCartList,
  TransferCartItem,
} from '../../store/redux/warehouseSessionSlice';
import { Warehouse, executeStockTransfer } from '../../services/inventory.service';

export interface StockTransferSessionViewProps {
  fromWarehouse: Warehouse | null;
  toWarehouse: Warehouse | null;
  onChangeFromWarehouse: () => void;
  onChangeToWarehouse: () => void;
  onOpenScanner: () => void;
  onTransferCompleted: () => void;
}

export const StockTransferSessionView: React.FC<StockTransferSessionViewProps> = ({
  fromWarehouse,
  toWarehouse,
  onChangeFromWarehouse,
  onChangeToWarehouse,
  onOpenScanner,
  onTransferCompleted,
}) => {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();
  const transferItems = useAppSelector(selectTransferCartList);

  const [isTransferring, setIsTransferring] = useState(false);

  const handleIncrement = (item: TransferCartItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch(
      setTransferCartItemQty({
        productId: item.productId,
        quantity: item.quantity + 1,
      })
    );
  };

  const handleDecrement = (item: TransferCartItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (item.quantity <= 1) {
      dispatch(removeTransferCartItem(item.productId));
    } else {
      dispatch(
        setTransferCartItemQty({
          productId: item.productId,
          quantity: item.quantity - 1,
        })
      );
    }
  };

  const handleRemove = (productId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch(removeTransferCartItem(productId));
  };

  const handleExecuteTransfer = async () => {
    if (!fromWarehouse) {
      Alert.alert('Uyarı', 'Lütfen çıkış deposunu seçin.');
      return;
    }
    if (!toWarehouse) {
      Alert.alert('Uyarı', 'Lütfen hedef depoyu seçin.');
      return;
    }
    if (fromWarehouse.id === toWarehouse.id) {
      Alert.alert('Uyarı', 'Çıkış ve hedef depo aynı olamaz.');
      return;
    }
    if (transferItems.length === 0) {
      Alert.alert('Uyarı', 'Lütfen transfer edilecek en az bir ürün ekleyin/tarayın.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    Alert.alert(
      'Transferi Onayla',
      `${fromWarehouse.name} ➔ ${toWarehouse.name}\nToplam ${transferItems.length} kalem ürün transfer edilecek. Onaylıyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Transfer Et',
          style: 'default',
          onPress: async () => {
            setIsTransferring(true);
            try {
              // Execute transfers sequentially
              for (const item of transferItems) {
                await executeStockTransfer({
                  productId: item.productId,
                  fromWarehouseId: fromWarehouse.id,
                  toWarehouseId: toWarehouse.id,
                  quantity: item.quantity,
                  notes: `Mobil Depo Transferi - ${new Date().toLocaleDateString('tr-TR')}`,
                });
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert('Başarılı', 'Transfer işlemi tamamlandı.');
              dispatch(clearTransferCart());
              onTransferCompleted();
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert('Hata', err?.response?.data?.message || 'Transfer gerçekleştirilemedi.');
            } finally {
              setIsTransferring(false);
            }
          },
        },
      ]
    );
  };

  const totalTransferUnits = transferItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <View style={styles.container}>
      {/* Warehouses Flow Card: From -> To */}
      <View
        style={[
          styles.flowCard,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.lg,
            ...theme.shadows.sm,
          },
        ]}
      >
        {/* From Warehouse */}
        <TouchableOpacity
          style={styles.whNode}
          onPress={onChangeFromWarehouse}
          activeOpacity={0.7}
        >
          <View style={styles.whNodeHeader}>
            <Ionicons name="log-out-outline" size={14} color={theme.colors.danger} />
            <Text style={[styles.whNodeLabel, { color: theme.colors.textMuted }]}>ÇIKIŞ DEPOSU</Text>
          </View>
          <Text
            style={[
              styles.whNodeTitle,
              { color: fromWarehouse ? theme.colors.text : theme.colors.primary },
            ]}
            numberOfLines={1}
          >
            {fromWarehouse ? fromWarehouse.name : 'Depo Seçin'}
          </Text>
        </TouchableOpacity>

        {/* Transfer Arrow Icon */}
        <View
          style={[
            styles.arrowCircle,
            { backgroundColor: theme.colors.borderSubtle },
          ]}
        >
          <Ionicons name="arrow-forward" size={18} color={theme.colors.primary} />
        </View>

        {/* To Warehouse */}
        <TouchableOpacity
          style={styles.whNode}
          onPress={onChangeToWarehouse}
          activeOpacity={0.7}
        >
          <View style={styles.whNodeHeader}>
            <Ionicons name="log-in-outline" size={14} color={theme.colors.success} />
            <Text style={[styles.whNodeLabel, { color: theme.colors.textMuted }]}>HEDEF DEPO</Text>
          </View>
          <Text
            style={[
              styles.whNodeTitle,
              { color: toWarehouse ? theme.colors.text : theme.colors.primary },
            ]}
            numberOfLines={1}
          >
            {toWarehouse ? toWarehouse.name : 'Depo Seçin'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Cart Summary Bar */}
      {transferItems.length > 0 && (
        <View style={styles.cartHeaderRow}>
          <Text style={[styles.cartTitle, { color: theme.colors.text }]}>
            Transfer Sepeti ({transferItems.length} Kalem, {totalTransferUnits} Adet)
          </Text>
          <TouchableOpacity onPress={() => dispatch(clearTransferCart())}>
            <Text style={[styles.clearBtnText, { color: theme.colors.danger }]}>Temizle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cart List */}
      <FlatList
        data={transferItems}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View
            style={[
              styles.cartItemCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <View style={styles.cartItemLeft}>
              <Text style={[styles.cartItemName, { color: theme.colors.text }]} numberOfLines={1}>
                {item.productName}
              </Text>
              <Text style={[styles.cartItemCode, { color: theme.colors.textMuted }]}>
                Kod: {item.productCode}
              </Text>
            </View>

            <View style={styles.cartItemRight}>
              {/* Stepper */}
              <View style={styles.stepperWrapper}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.colors.borderSubtle }]}
                  onPress={() => handleDecrement(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.quantity === 1 ? 'trash-outline' : 'remove'} size={14} color={theme.colors.text} />
                </TouchableOpacity>

                <Text style={[styles.stepperValue, { color: theme.colors.text }]}>
                  {item.quantity}
                </Text>

                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => handleIncrement(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.deleteTouch}
                onPress={() => handleRemove(item.productId)}
              >
                <Ionicons name="close" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCartCard}>
            <Ionicons name="swap-horizontal-outline" size={44} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              Transfer Sepeti Boş
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
              Ürünleri kamerayla okutarak veya stok sorgu ekranından "Transfer Et" seçeneğiyle
              sepete ekleyebilirsiniz.
            </Text>
          </View>
        }
      />

      {/* Bottom Sticky Control Bar */}
      <View
        style={[
          styles.bottomStickyBar,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderTopColor: theme.colors.borderSubtle,
            ...theme.shadows.md,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.cameraScanBtn, { backgroundColor: theme.colors.borderSubtle }]}
          onPress={onOpenScanner}
          activeOpacity={0.7}
        >
          <Ionicons name="barcode-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.cameraScanBtnText, { color: theme.colors.primary }]}>
            Ürün Tara
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.transferSubmitBtn,
            {
              backgroundColor: theme.colors.primary,
              opacity: isTransferring || transferItems.length === 0 ? 0.6 : 1,
            },
          ]}
          disabled={isTransferring || transferItems.length === 0}
          onPress={handleExecuteTransfer}
          activeOpacity={0.8}
        >
          {isTransferring ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="arrow-forward-circle" size={18} color="#ffffff" />
              <Text style={styles.transferSubmitText}>Transferi Yap</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
  },
  whNode: {
    flex: 1,
  },
  whNodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  whNodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  whNodeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  cartTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
    gap: 8,
  },
  cartItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
  },
  cartItemLeft: {
    flex: 1,
    marginRight: 10,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  cartItemCode: {
    fontSize: 11,
    marginTop: 2,
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '800',
    minWidth: 20,
    textAlign: 'center',
  },
  deleteTouch: {
    padding: 4,
  },
  emptyCartCard: {
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
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  cameraScanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  cameraScanBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  transferSubmitBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  transferSubmitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
