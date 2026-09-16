import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ProductLookup, StockLevel } from '../../services/inventory.service';
import { Badge } from '../common/Badge';
import { OptimizedImage } from '../common/OptimizedImage';
import { formatCurrency } from '../../lib/utils';
import { ReservedStockDetailModal } from './ReservedStockDetailModal';
import { thermalPrinterService, generateProductLabel } from '../../services/thermal-printer.service';

export interface StockLookupModalProps {
  visible: boolean;
  product: ProductLookup | null;
  stockLevels: StockLevel[];
  onClose: () => void;
  onStartCount?: (product: ProductLookup) => void;
  onStartTransfer?: (product: ProductLookup) => void;
}

export const StockLookupModal: React.FC<StockLookupModalProps> = ({
  visible,
  product,
  stockLevels,
  onClose,
  onStartCount,
  onStartTransfer,
}) => {
  const { theme } = useTheme();
  const [reservedModalVisible, setReservedModalVisible] = useState(false);

  if (!product) return null;

  const totalStock = stockLevels.reduce((sum, s) => sum + (s.quantity || 0), 0);
  const totalReserved = stockLevels.reduce((sum, s) => sum + (s.reservedQuantity || 0), 0);
  const totalAvailable = Math.max(0, totalStock - totalReserved);
  const isCritical = product.minStockLevel > 0 && totalStock <= product.minStockLevel;

  const handlePrintLabel = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const { bytes } = generateProductLabel(product);
      const res = await thermalPrinterService.print(bytes, `Ürün Etiketi - ${product.code}`);
      Alert.alert(res.success ? 'Yazdırıldı' : 'Yazıcı Uyarısı', res.message);
    } catch {
      Alert.alert('Hata', 'Barkod etiketi yazdırılamadı.');
    }
  };

  const handleCountPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    onStartCount?.(product);
  };

  const handleTransferPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    onStartTransfer?.(product);
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
            <OptimizedImage
              source={undefined}
              fallbackIcon="cube-outline"
              fallbackIconSize={20}
              containerStyle={[
                styles.iconBadge,
                { backgroundColor: theme.colors.primaryMuted, borderWidth: 0 },
              ]}
            />
            <View style={styles.headerTitles}>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                SKU: {product.code} {product.barcode ? `• Barkod: ${product.barcode}` : ''}
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

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Summary Banner */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: isCritical ? theme.colors.danger : theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <View style={styles.summaryTopRow}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
                TOPLAM STOK DURUMU
              </Text>
              <Badge
                label={isCritical ? 'KRİTİK STOK' : totalStock > 0 ? 'STOKTA VAR' : 'TÜKENDİ'}
                variant={isCritical ? 'danger' : totalStock > 0 ? 'success' : 'neutral'}
                size="sm"
              />
            </View>

            <View style={styles.summaryStatsRow}>
              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>
                  {totalStock} {product.unit?.code || 'AD'}
                </Text>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Fiziksel</Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: theme.colors.borderSubtle }]} />

              <TouchableOpacity
                style={styles.statCol}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setReservedModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statValue, { color: theme.colors.warning }]}>
                  {totalReserved} {product.unit?.code || 'AD'}
                </Text>
                <View style={styles.rezerveLabelRow}>
                  <Text style={[styles.statLabel, { color: theme.colors.warning, fontWeight: '700' }]}>
                    Rezerve
                  </Text>
                  <Ionicons name="information-circle-outline" size={13} color={theme.colors.warning} />
                </View>
              </TouchableOpacity>

              <View style={[styles.statDivider, { backgroundColor: theme.colors.borderSubtle }]} />

              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                  {totalAvailable} {product.unit?.code || 'AD'}
                </Text>
                <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Kullanılabilir</Text>
              </View>
            </View>
          </View>

          {/* Pricing & Category Info */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Fiyat & Tanım Bilgileri</Text>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Satış Fiyatı</Text>
              <Text style={[styles.infoValue, { color: theme.colors.primary, fontWeight: '700' }]}>
                {formatCurrency(product.salesPrice)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Alış Fiyatı</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {formatCurrency(product.purchasePrice)}
              </Text>
            </View>

            {product.category && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Kategori</Text>
                <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                  {product.category.name}
                </Text>
              </View>
            )}

            {product.minStockLevel > 0 && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>Asgari Stok Limiti</Text>
                <Text style={[styles.infoValue, { color: theme.colors.danger, fontWeight: '600' }]}>
                  {product.minStockLevel} {product.unit?.code || 'AD'}
                </Text>
              </View>
            )}
          </View>

          {/* Warehouse Breakdown */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Depo Bazlı Stok Dağılımı ({stockLevels.length})
            </Text>

            {stockLevels.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                Bu ürün için henüz depo stok kaydı bulunmuyor.
              </Text>
            ) : (
              stockLevels.map((lvl, index) => {
                const whName = lvl.warehouse?.name || `Depo ${index + 1}`;
                const available = Math.max(0, lvl.quantity - (lvl.reservedQuantity || 0));

                return (
                  <View
                    key={lvl.warehouseId || index}
                    style={[
                      styles.whRow,
                      index < stockLevels.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.borderSubtle,
                      },
                    ]}
                  >
                    <View style={styles.whLeft}>
                      <Ionicons name="business-outline" size={16} color={theme.colors.primary} />
                      <View>
                        <Text style={[styles.whName, { color: theme.colors.text }]}>{whName}</Text>
                        <Text style={[styles.whMeta, { color: theme.colors.textMuted }]}>
                          Rezerve: {lvl.reservedQuantity || 0}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.whRight}>
                      <Text style={[styles.whStock, { color: theme.colors.text }]}>
                        {lvl.quantity} {product.unit?.code || 'AD'}
                      </Text>
                      <Text style={[styles.whAvailable, { color: theme.colors.success }]}>
                        {available} Hazır
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Bottom Quick Action CTAs */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
              ...theme.shadows.md,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.actionBtn,
              {
                backgroundColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
                flex: 0.8,
              },
            ]}
            onPress={handlePrintLabel}
            activeOpacity={0.7}
          >
            <Ionicons name="print-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Etiket</Text>
          </TouchableOpacity>

          {onStartTransfer && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.transferBtn,
                {
                  backgroundColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
              onPress={handleTransferPress}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>
                Transfer
              </Text>
            </TouchableOpacity>
          )}

          {onStartCount && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.countBtn,
                {
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
              onPress={handleCountPress}
              activeOpacity={0.7}
            >
              <Ionicons name="clipboard-outline" size={18} color="#ffffff" />
              <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Sayım</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Reserved Stock Breakdown & Allocations Modal */}
        <ReservedStockDetailModal
          visible={reservedModalVisible}
          product={product}
          physicalQty={totalStock}
          reservedQty={totalReserved}
          availableQty={totalAvailable}
          onClose={() => setReservedModalVisible(false)}
        />
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
  },
  summaryCard: {
    padding: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 4,
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  infoCard: {
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  whRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  whLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  whName: {
    fontSize: 13,
    fontWeight: '600',
  },
  whMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  whRight: {
    alignItems: 'flex-end',
  },
  whStock: {
    fontSize: 13,
    fontWeight: '700',
  },
  whAvailable: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  transferBtn: {},
  countBtn: {},
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  rezerveLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
