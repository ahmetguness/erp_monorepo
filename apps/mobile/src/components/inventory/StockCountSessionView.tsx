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
  updateCountedQty,
  resetSession,
  selectExpectedItemsList,
  selectMatchedSummary,
  ExpectedItem,
} from '../../store/redux/warehouseSessionSlice';
import { Warehouse, createStockCount, finalizeStockCount } from '../../services/inventory.service';
import { Badge } from '../common/Badge';

export interface StockCountSessionViewProps {
  warehouse: Warehouse | null;
  onChangeWarehouse: () => void;
  onOpenScanner: () => void;
  onSessionCompleted: () => void;
}

export const StockCountSessionView: React.FC<StockCountSessionViewProps> = ({
  warehouse,
  onChangeWarehouse,
  onOpenScanner,
  onSessionCompleted,
}) => {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();
  const expectedItems = useAppSelector(selectExpectedItemsList);
  const summary = useAppSelector(selectMatchedSummary);

  const [isSaving, setIsSaving] = useState(false);

  const handleIncrement = (item: ExpectedItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch(
      updateCountedQty({
        productId: item.productId,
        countedQty: item.countedQty + 1,
      })
    );
  };

  const handleDecrement = (item: ExpectedItem) => {
    if (item.countedQty <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch(
      updateCountedQty({
        productId: item.productId,
        countedQty: item.countedQty - 1,
      })
    );
  };

  const handleCompleteCount = async () => {
    if (!warehouse) {
      Alert.alert('Uyarı', 'Lütfen önce sayım yapılacak depoyu seçin.');
      return;
    }

    if (expectedItems.length === 0) {
      Alert.alert('Uyarı', 'Sayım listesinde ürün bulunmuyor.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    Alert.alert(
      'Sayımı Kaydet',
      `Toplam ${summary.totalItems} kalem sayıldı (${summary.totalCounted} adet).\nSayım fişi oluşturulup kesinleştirilsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaydet ve Tamamla',
          style: 'default',
          onPress: async () => {
            setIsSaving(true);
            try {
              const countPayload = {
                warehouseId: warehouse.id,
                date: new Date().toISOString(),
                notes: `Mobil Hızlı Sayım - ${new Date().toLocaleDateString('tr-TR')}`,
                items: expectedItems.map((i) => ({
                  productId: i.productId,
                  expectedQty: i.expectedQty,
                  countedQty: i.countedQty,
                })),
              };

              const created = await createStockCount(countPayload);
              if (created?.id) {
                await finalizeStockCount(created.id);
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert('Başarılı', `Sayım fişi (${created.number}) başarıyla kaydedildi ve kesinleştirildi.`);
              dispatch(resetSession());
              onSessionCompleted();
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert('Hata', err?.response?.data?.message || 'Sayım kaydedilemedi.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Warehouse Selector Card */}
      <View
        style={[
          styles.whBanner,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.lg,
            ...theme.shadows.sm,
          },
        ]}
      >
        <View style={styles.whBannerLeft}>
          <View
            style={[
              styles.whBannerIcon,
              { backgroundColor: theme.colors.primaryMuted },
            ]}
          >
            <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
          </View>
          <View>
            <Text style={[styles.whBannerLabel, { color: theme.colors.textMuted }]}>
              SAYIM YAPILAN DEPO
            </Text>
            <Text style={[styles.whBannerTitle, { color: theme.colors.text }]}>
              {warehouse ? warehouse.name : 'Depo Seçilmedi'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.changeWhBtn, { backgroundColor: theme.colors.borderSubtle }]}
          onPress={onChangeWarehouse}
          activeOpacity={0.7}
        >
          <Text style={[styles.changeWhBtnText, { color: theme.colors.primary }]}>
            {warehouse ? 'Değiştir' : 'Depo Seç'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Progress & Summary Metric Bar */}
      {expectedItems.length > 0 && (
        <View
          style={[
            styles.metricsRow,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
              borderRadius: theme.borderRadius.lg,
              ...theme.shadows.sm,
            },
          ]}
        >
          <View style={styles.metricItem}>
            <Text style={[styles.metricNum, { color: theme.colors.text }]}>
              {summary.totalItems}
            </Text>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Kalem</Text>
          </View>

          <View style={[styles.metricDivider, { backgroundColor: theme.colors.borderSubtle }]} />

          <View style={styles.metricItem}>
            <Text style={[styles.metricNum, { color: theme.colors.primary }]}>
              {summary.totalCounted} / {summary.totalExpected}
            </Text>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Adet</Text>
          </View>

          <View style={[styles.metricDivider, { backgroundColor: theme.colors.borderSubtle }]} />

          <View style={styles.metricItem}>
            <Text style={[styles.metricNum, { color: theme.colors.success }]}>
              {summary.exactMatches}
            </Text>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Eşleşen</Text>
          </View>

          <View style={[styles.metricDivider, { backgroundColor: theme.colors.borderSubtle }]} />

          <View style={styles.metricItem}>
            <Text
              style={[
                styles.metricNum,
                { color: summary.underCount > 0 ? theme.colors.warning : theme.colors.textMuted },
              ]}
            >
              {summary.underCount}
            </Text>
            <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Fark</Text>
          </View>
        </View>
      )}

      {/* Items List */}
      <FlatList
        data={expectedItems}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const diff = item.countedQty - item.expectedQty;
          const isExact = diff === 0 && item.countedQty > 0;
          const isUnder = diff < 0;
          const isOver = diff > 0;

          return (
            <View
              style={[
                styles.itemCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: isExact
                    ? theme.colors.success
                    : isUnder && item.countedQty > 0
                    ? theme.colors.warning
                    : theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleCol}>
                  <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text style={[styles.itemCode, { color: theme.colors.textMuted }]}>
                    Kod: {item.productCode} {item.barcode ? `• ${item.barcode}` : ''}
                  </Text>
                </View>

                {item.countedQty > 0 ? (
                  <Badge
                    label={isExact ? '= Tam' : diff > 0 ? `+${diff} Fazla` : `${diff} Eksik`}
                    variant={isExact ? 'success' : isOver ? 'info' : 'warning'}
                    size="sm"
                  />
                ) : (
                  <Badge label="Sayılmadı" variant="neutral" size="sm" />
                )}
              </View>

              {/* Counts row */}
              <View style={styles.itemActionsRow}>
                <View style={styles.itemStats}>
                  <Text style={[styles.statExpected, { color: theme.colors.textMuted }]}>
                    Beklenen: <Text style={{ fontWeight: '700', color: theme.colors.text }}>{item.expectedQty}</Text>
                  </Text>
                  <Text style={[styles.statCounted, { color: theme.colors.primary }]}>
                    Sayılan: <Text style={{ fontWeight: '800' }}>{item.countedQty}</Text>
                  </Text>
                </View>

                {/* Quick Counter Stepper */}
                <View style={styles.stepperWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      {
                        backgroundColor: theme.colors.borderSubtle,
                        opacity: item.countedQty <= 0 ? 0.35 : 1,
                      },
                    ]}
                    disabled={item.countedQty <= 0}
                    onPress={() => handleDecrement(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={16} color={theme.colors.text} />
                  </TouchableOpacity>

                  <Text style={[styles.stepperValue, { color: theme.colors.text }]}>
                    {item.countedQty}
                  </Text>

                  <TouchableOpacity
                    style={[styles.stepperBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={() => handleIncrement(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="clipboard-outline" size={44} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              {warehouse ? 'Depoda Ürün Bulunamadı' : 'Önce Depo Seçiniz'}
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
              {warehouse
                ? 'Seçili depoda stok kaydı bulunamadı veya sayım listesi boş.'
                : 'Sayım başlatmak için yukarıdaki panelden sayım yapacağınız depoyu seçin.'}
            </Text>
          </View>
        }
      />

      {/* Bottom Floating Control Bar */}
      {expectedItems.length > 0 && (
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
              Barkod Oku
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              {
                backgroundColor: theme.colors.success,
                opacity: isSaving ? 0.7 : 1,
              },
            ]}
            disabled={isSaving}
            onPress={handleCompleteCount}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={18} color="#ffffff" />
                <Text style={styles.saveBtnText}>Sayımı Tamamla</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  whBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
  },
  whBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  whBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  whBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  changeWhBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  changeWhBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    borderWidth: 1,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricNum: {
    fontSize: 16,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 24,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
    gap: 8,
  },
  itemCard: {
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitleCol: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemCode: {
    fontSize: 11,
    marginTop: 2,
  },
  itemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  itemStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statExpected: {
    fontSize: 12,
  },
  statCounted: {
    fontSize: 12,
  },
  stepperWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  emptyCard: {
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
  saveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
