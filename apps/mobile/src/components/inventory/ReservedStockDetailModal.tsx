import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import {
  ProductLookup,
  InventoryReservation,
  getProductStockReservations,
} from '../../services/inventory.service';
import { Badge } from '../common/Badge';

export interface ReservedStockDetailModalProps {
  visible: boolean;
  product: ProductLookup | null;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  onClose: () => void;
}

export const ReservedStockDetailModal: React.FC<ReservedStockDetailModalProps> = ({
  visible,
  product,
  physicalQty,
  reservedQty,
  availableQty,
  onClose,
}) => {
  const { theme } = useTheme();

  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadReservations = useCallback(async () => {
    if (!product) return;
    setIsLoading(true);
    try {
      const list = await getProductStockReservations(product.id);
      setReservations(list);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  }, [product]);

  useEffect(() => {
    if (visible && product) {
      loadReservations();
    } else {
      setReservations([]);
    }
  }, [visible, product, loadReservations]);

  const unitCode = product?.unit?.code || 'AD';

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
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.headerTitles}>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
                Stok Tahsisat & Rezervasyon
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {product?.name} ({product?.code})
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

        {/* 3-Way Stock Breakdown Cards */}
        <View style={styles.breakdownRow}>
          {/* Physical */}
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {physicalQty}
            </Text>
            <Text style={[styles.statUnit, { color: theme.colors.textMuted }]}>{unitCode}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Fiili Stok</Text>
          </View>

          {/* Reserved */}
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.warning,
                borderRadius: theme.borderRadius.md,
                borderWidth: 1.5,
              },
            ]}
          >
            <Text style={[styles.statValue, { color: theme.colors.warning }]}>
              {reservedQty}
            </Text>
            <Text style={[styles.statUnit, { color: theme.colors.warning }]}>{unitCode}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.warning, fontWeight: '700' }]}>
              Rezerve
            </Text>
          </View>

          {/* Available */}
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {availableQty}
            </Text>
            <Text style={[styles.statUnit, { color: theme.colors.primary }]}>{unitCode}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Kullanılabilir</Text>
          </View>
        </View>

        {/* Reservations List Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Aktif Rezervasyon Listesi ({reservations.length})
          </Text>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
            Bekleyen Müşteri Siparişleri & Üretim Emirleri
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
              Tahsisat kayıtları getiriliyor...
            </Text>
          </View>
        ) : reservations.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="lock-open-outline" size={54} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              Aktif Rezervasyon Bulunmuyor
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
              Bu ürün için bekleyen satış siparişlerine veya üretim emirlerine ayrılmış herhangi bir stok
              bağlantısı yoktur. Tüm fiili stok serbest durumdadır.
            </Text>
          </View>
        ) : (
          <FlatList
            data={reservations}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: res }) => {
              const resQty = Number(res.quantity);
              const isSalesOrder = res.refType === 'SALES_ORDER';
              const dateStr = new Date(res.reservedAt).toLocaleDateString('tr-TR');

              return (
                <View
                  style={[
                    styles.reservationCard,
                    {
                      backgroundColor: theme.colors.surfaceCard,
                      borderColor: theme.colors.borderSubtle,
                      borderRadius: theme.borderRadius.md,
                      ...theme.shadows.sm,
                    },
                  ]}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.refBadgeRow}>
                      <Badge
                        label={isSalesOrder ? 'MÜŞTERİ SİPARİŞİ' : res.refType}
                        variant={isSalesOrder ? 'info' : 'neutral'}
                        size="sm"
                      />
                      <Text style={[styles.refIdText, { color: theme.colors.text }]}>
                        #{res.refId.slice(0, 8).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.resQtyCol}>
                      <Text style={[styles.resQtyValue, { color: theme.colors.warning }]}>
                        {resQty} {unitCode}
                      </Text>
                      <Text style={[styles.resQtyLabel, { color: theme.colors.textMuted }]}>
                        Ayrılan Miktar
                      </Text>
                    </View>
                  </View>

                  {res.notes && (
                    <Text style={[styles.resNotes, { color: theme.colors.textSecondary }]}>
                      {res.notes}
                    </Text>
                  )}

                  <View style={[styles.cardDivider, { backgroundColor: theme.colors.borderSubtle }]} />

                  <View style={styles.cardBottomRow}>
                    <View style={styles.bottomMetaItem}>
                      <Ionicons name="business-outline" size={13} color={theme.colors.textMuted} />
                      <Text style={[styles.bottomMetaText, { color: theme.colors.textMuted }]}>
                        {res.warehouse?.name || 'Tüm Depolar'}
                      </Text>
                    </View>

                    <View style={styles.bottomMetaItem}>
                      <Ionicons name="calendar-outline" size={13} color={theme.colors.textMuted} />
                      <Text style={[styles.bottomMetaText, { color: theme.colors.textMuted }]}>
                        {dateStr}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
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
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statUnit: { fontSize: 10, fontWeight: '600', marginTop: -2 },
  statLabel: { fontSize: 11, marginTop: 4 },
  sectionHeaderRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  sectionSubtitle: { fontSize: 11 },
  listContent: { padding: 16, gap: 12 },
  reservationCard: { padding: 14, borderWidth: 1, gap: 10 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refIdText: { fontSize: 13, fontWeight: '700' },
  resQtyCol: { alignItems: 'flex-end' },
  resQtyValue: { fontSize: 16, fontWeight: '800' },
  resQtyLabel: { fontSize: 10 },
  resNotes: { fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  cardDivider: { height: 0.5 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bottomMetaText: { fontSize: 11 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 13 },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
