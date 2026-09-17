// apps/mobile/src/features/procurement/components/ProcurementInspectionPane.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import {
  PurchaseOrder,
  PurchaseRequest,
} from '../../../services/procurement.service';
import { Badge } from '../../../components/common/Badge';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { formatCurrency, formatDate } from '../../../lib/utils';

export interface ProcurementInspectionPaneProps {
  order?: PurchaseOrder | null;
  request?: PurchaseRequest | null;
  mode: 'ORDER' | 'REQUEST';
  onReceiveGoods?: (order: PurchaseOrder) => void;
  onApproveRequest?: (request: PurchaseRequest) => void;
  onConvertToOrder?: (request: PurchaseRequest) => void;
}

export const ProcurementInspectionPane: React.FC<ProcurementInspectionPaneProps> = ({
  order,
  request,
  mode,
  onReceiveGoods,
  onApproveRequest,
  onConvertToOrder,
}) => {
  const { theme } = useTheme();

  // If nothing is selected
  if ((mode === 'ORDER' && !order) || (mode === 'REQUEST' && !request)) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.colors.surfaceCard }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.borderSubtle }]}>
          <Ionicons name="documents-outline" size={48} color={theme.colors.textMuted} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Kayıt Seçilmedi</Text>
        <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
          Sol listeden incelemek istediğiniz satın alma siparişi veya talebine dokunun.
        </Text>
      </View>
    );
  }

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const title = mode === 'ORDER' ? `Satın Alma Siparişi: ${order?.number}` : `Satın Alma Talebi: ${request?.number}`;
    const amount = mode === 'ORDER' ? formatCurrency(order?.totalGross ?? 0) : formatCurrency(request?.totalEstimated ?? 0);
    Share.share({
      title,
      message: `${title}\nTutar: ${amount}\nAXON Satın Alma Portalı`,
    }).catch(() => {});
  };

  if (mode === 'ORDER' && order) {
    const totalOrderedQty = order.items?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0;
    const totalReceivedQty = order.items?.reduce((acc, i) => acc + (i.received || 0), 0) || 0;
    const matchRatio = totalOrderedQty > 0 ? Math.min(1, totalReceivedQty / totalOrderedQty) : 0;
    const isFullyReceived = totalOrderedQty > 0 && totalReceivedQty >= totalOrderedQty;

    return (
      <View style={[styles.paneContainer, { backgroundColor: theme.colors.surface1, borderLeftColor: theme.colors.borderSubtle }]}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Card */}
          <View style={[styles.headerCard, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
            <View style={styles.headerTop}>
              <View style={styles.titleWrap}>
                <View style={[styles.badgePill, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="cart" size={13} color={theme.colors.primary} />
                  <Text style={[styles.badgePillText, { color: theme.colors.primary }]}>PO</Text>
                </View>
                <Text style={[styles.docNumber, { color: theme.colors.text }]}>{order.number}</Text>
              </View>
              <Badge label={order.status} variant={order.status === 'RECEIVED' ? 'success' : order.status === 'CANCELLED' ? 'danger' : 'info'} />
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>SİPARİŞ TARİHİ</Text>
                <Text style={[styles.metaValue, { color: theme.colors.text }]}>{formatDate(order.date)}</Text>
              </View>
              {order.dueDate && (
                <View style={styles.metaItem}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>VADE / TESLİM</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{formatDate(order.dueDate)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Supplier Card */}
          {order.contact && (
            <View style={[styles.sectionCard, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="business" size={16} color={theme.colors.primary} />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Tedarikçi Bilgileri</Text>
              </View>
              <Text style={[styles.supplierName, { color: theme.colors.text }]}>{order.contact.name}</Text>
              <View style={styles.contactRow}>
                {order.contact.phone && (
                  <View style={styles.contactBadge}>
                    <Ionicons name="call-outline" size={13} color={theme.colors.textSecondary} />
                    <Text style={[styles.contactText, { color: theme.colors.textSecondary }]}>{order.contact.phone}</Text>
                  </View>
                )}
                {order.contact.email && (
                  <View style={styles.contactBadge}>
                    <Ionicons name="mail-outline" size={13} color={theme.colors.textSecondary} />
                    <Text style={[styles.contactText, { color: theme.colors.textSecondary }]}>{order.contact.email}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* 3-Way Match Status Card */}
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="git-compare-outline" size={16} color={isFullyReceived ? '#10B981' : theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>3-Way Match Eşleşme Durumu</Text>
            </View>
            <View style={styles.matchBarContainer}>
              <View style={styles.matchStatsRow}>
                <Text style={[styles.matchStatText, { color: theme.colors.textMuted }]}>
                  Teslimat: <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{totalReceivedQty}</Text> / {totalOrderedQty} Adet
                </Text>
                <Text style={[styles.matchStatText, { color: isFullyReceived ? '#10B981' : theme.colors.primary, fontWeight: '700' }]}>
                  %{Math.round(matchRatio * 100)}
                </Text>
              </View>
              <View style={[styles.matchTrack, { backgroundColor: theme.colors.borderSubtle }]}>
                <View
                  style={[
                    styles.matchFill,
                    {
                      width: `${Math.round(matchRatio * 100)}%`,
                      backgroundColor: isFullyReceived ? '#10B981' : theme.colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Line Items Table */}
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="list" size={16} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Kalem Dökümü ({order.items?.length || 0})
              </Text>
            </View>

            {order.items?.map((item, idx) => (
              <View
                key={item.id || idx}
                style={[
                  styles.itemRow,
                  idx < (order.items?.length || 0) - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.borderSubtle,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.product?.name || item.description || 'Ürün'}
                  </Text>
                  <Text style={[styles.itemSku, { color: theme.colors.textMuted }]}>
                    SKU: {item.product?.code || '-'} • Birim: {formatCurrency(item.unitPrice, order.currencyCode)}
                  </Text>
                </View>
                <View style={styles.itemQuantities}>
                  <Text style={[styles.itemQty, { color: theme.colors.text }]}>
                    {item.received || 0} / {item.quantity} Adet
                  </Text>
                  <TabularText style={[styles.itemTotal, { color: theme.colors.primary }]}>
                    {formatCurrency(item.lineTotal || item.quantity * item.unitPrice, order.currencyCode)}
                  </TabularText>
                </View>
              </View>
            ))}

            {/* Financial Summary */}
            <View style={[styles.financialBox, { borderTopColor: theme.colors.borderSubtle }]}>
              <View style={styles.financialRow}>
                <Text style={[styles.finLabel, { color: theme.colors.textMuted }]}>Ara Toplam</Text>
                <TabularText style={[styles.finVal, { color: theme.colors.text }]}>
                  {formatCurrency(order.totalNet, order.currencyCode)}
                </TabularText>
              </View>
              <View style={styles.financialRow}>
                <Text style={[styles.finLabel, { color: theme.colors.textMuted }]}>KDV Toplamı</Text>
                <TabularText style={[styles.finVal, { color: theme.colors.text }]}>
                  {formatCurrency(order.totalTax, order.currencyCode)}
                </TabularText>
              </View>
              <View style={styles.financialRowTotal}>
                <Text style={[styles.finTotalLabel, { color: theme.colors.text }]}>Genel Toplam</Text>
                <TabularText style={[styles.finTotalVal, { color: theme.colors.primary }]}>
                  {formatCurrency(order.totalGross, order.currencyCode)}
                </TabularText>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Sticky Action Footer */}
        <View style={[styles.actionFooter, { backgroundColor: theme.colors.surfaceCard, borderTopColor: theme.colors.borderSubtle }]}>
          <TouchableOpacity
            style={[styles.secondaryActionBtn, { borderColor: theme.colors.borderSubtle }]}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>

          {order.status !== 'RECEIVED' && order.status !== 'CANCELLED' && onReceiveGoods && (
            <SpringPressable
              style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
              onPress={() => onReceiveGoods(order)}
            >
              <Ionicons name="cube-outline" size={18} color="#ffffff" />
              <Text style={styles.primaryActionBtnText}>Mal Kabul Başlat (GRN)</Text>
            </SpringPressable>
          )}
        </View>
      </View>
    );
  }

  // PR Mode
  return (
    <View style={[styles.paneContainer, { backgroundColor: theme.colors.surface1, borderLeftColor: theme.colors.borderSubtle }]}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerCard, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
          <View style={styles.headerTop}>
            <View style={styles.titleWrap}>
              <View style={[styles.badgePill, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="clipboard" size={13} color={theme.colors.primary} />
                <Text style={[styles.badgePillText, { color: theme.colors.primary }]}>PR</Text>
              </View>
              <Text style={[styles.docNumber, { color: theme.colors.text }]}>{request?.number}</Text>
            </View>
            <Badge label={request?.status || 'DRAFT'} variant={request?.status === 'APPROVED' ? 'success' : 'warning'} />
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>TALEP TARİHİ</Text>
              <Text style={[styles.metaValue, { color: theme.colors.text }]}>{formatDate(request?.date || '')}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>TALEP EDEN</Text>
              <Text style={[styles.metaValue, { color: theme.colors.text }]}>{request?.requestedBy || 'Personel'}</Text>
            </View>
          </View>
        </View>

        {/* Estimated Total Card */}
        <View style={[styles.sectionCard, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
          <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>TAHMİNİ BÜTÇE / TUTAR</Text>
          <TabularText style={[styles.estimatedAmount, { color: theme.colors.primary }]}>
            {formatCurrency(request?.totalEstimated ?? 0)}
          </TabularText>
          {request?.notes && (
            <Text style={[styles.requestNotes, { color: theme.colors.textSecondary }]}>
              "{request.notes}"
            </Text>
          )}
        </View>

        {/* PR Line Items */}
        <View style={[styles.sectionCard, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="list" size={16} color={theme.colors.primary} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Talep Kalemleri ({request?.items?.length || 0})
            </Text>
          </View>

          {request?.items?.map((item, idx) => (
            <View
              key={item.id || idx}
              style={[
                styles.itemRow,
                idx < (request?.items?.length || 0) - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                  {item.product?.name || item.description || 'Talep Edilen Ürün'}
                </Text>
                <Text style={[styles.itemSku, { color: theme.colors.textMuted }]}>
                  SKU: {item.product?.code || '-'}
                </Text>
              </View>
              <Text style={[styles.itemQty, { color: theme.colors.text, fontWeight: '700' }]}>
                {item.quantity} Adet
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Sticky PR Action Footer */}
      <View style={[styles.actionFooter, { backgroundColor: theme.colors.surfaceCard, borderTopColor: theme.colors.borderSubtle }]}>
        <TouchableOpacity
          style={[styles.secondaryActionBtn, { borderColor: theme.colors.borderSubtle }]}
          onPress={handleShare}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={18} color={theme.colors.text} />
        </TouchableOpacity>

        {request?.status === 'PENDING_APPROVAL' && onApproveRequest && (
          <SpringPressable
            style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => onApproveRequest(request)}
          >
            <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
            <Text style={styles.primaryActionBtnText}>Talebi Onayla</Text>
          </SpringPressable>
        )}

        {request?.status === 'APPROVED' && onConvertToOrder && (
          <SpringPressable
            style={[styles.primaryActionBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => onConvertToOrder(request)}
          >
            <Ionicons name="cart" size={18} color="#ffffff" />
            <Text style={styles.primaryActionBtnText}>Siparişe (PO) Dönüştür</Text>
          </SpringPressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  paneContainer: {
    flex: 1,
    borderLeftWidth: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  headerCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  docNumber: {
    fontSize: 18,
    fontWeight: '800',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 20,
  },
  metaItem: {
    gap: 2,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  supplierName: {
    fontSize: 15,
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  contactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontSize: 12,
  },
  matchBarContainer: {
    gap: 6,
  },
  matchStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matchStatText: {
    fontSize: 12,
  },
  matchTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  matchFill: {
    height: '100%',
    borderRadius: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemSku: {
    fontSize: 11,
    marginTop: 2,
  },
  itemQuantities: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemQty: {
    fontSize: 12,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: '700',
  },
  financialBox: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 6,
    gap: 6,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  finLabel: {
    fontSize: 12,
  },
  finVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  financialRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  finTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  finTotalVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  estimatedAmount: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  requestNotes: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 6,
  },
  actionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  secondaryActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
