import React, { useState, useEffect, useCallback } from 'react';
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
  setExpectedItems,
  setActiveDeliveryNote,
  resetSession,
  selectExpectedItemsList,
  selectMatchedSummary,
  selectWarehouseSession,
  ExpectedItem,
} from '../../store/redux/warehouseSessionSlice';
import {
  DeliveryNote,
  getDeliveryNotes,
  getDeliveryNoteById,
  updateDeliveryNoteStatus,
} from '../../services/inventory.service';
import { Badge } from '../common/Badge';
import { formatDate } from '../../lib/utils';

export interface DeliveryVerificationViewProps {
  onOpenScanner: () => void;
}

export const DeliveryVerificationView: React.FC<DeliveryVerificationViewProps> = ({
  onOpenScanner,
}) => {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();
  const { activeDeliveryNoteId, unmatchedScans } = useAppSelector(selectWarehouseSession);
  const expectedItems = useAppSelector(selectExpectedItemsList);
  const summary = useAppSelector(selectMatchedSummary);

  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [activeNote, setActiveNote] = useState<DeliveryNote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await getDeliveryNotes({ type: 'INCOMING' });
      setDeliveryNotes(list);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleSelectDeliveryNote = async (note: DeliveryNote) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsLoading(true);
    try {
      const fullNote = await getDeliveryNoteById(note.id);
      setActiveNote(fullNote);
      dispatch(setActiveDeliveryNote(fullNote.id));

      // Map delivery note items to expectedItems in Redux
      const mapped: ExpectedItem[] = (fullNote.items || []).map((i) => ({
        productId: i.productId,
        productCode: i.product?.code || 'KODSUZ',
        productName: i.product?.name || 'İrsaliye Kalemi',
        barcode: i.product?.barcode || null,
        expectedQty: Number(i.orderedQty ?? i.quantity ?? 1),
        countedQty: Number(i.deliveredQty ?? 0),
      }));

      dispatch(setExpectedItems(mapped));
    } catch (err: any) {
      Alert.alert('Hata', 'İrsaliye detayları yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveNote(null);
    dispatch(resetSession());
  };

  const handleConfirmDelivery = async () => {
    if (!activeNote) return;

    if (!summary.isFullyVerified && summary.underCount > 0) {
      Alert.alert(
        'Eksik Kalemler Var',
        `İrsaliyede ${summary.underCount} adet eksik kalem bulunuyor. Yine de mal kabulü onaylamak istiyor musunuz?`,
        [
          { text: 'Saymaya Devam Et', style: 'cancel' },
          {
            text: 'Eksikle Kabul Et',
            style: 'destructive',
            onPress: () => submitDeliveryStatus(),
          },
        ]
      );
      return;
    }

    submitDeliveryStatus();
  };

  const submitDeliveryStatus = async () => {
    if (!activeNote) return;
    setIsVerifying(true);
    try {
      await updateDeliveryNoteStatus(activeNote.id, 'DELIVERED');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Başarılı', `İrsaliye (${activeNote.number}) mal kabulü tamamlandı.`);
      setActiveNote(null);
      dispatch(resetSession());
      loadNotes();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Hata', err?.response?.data?.message || 'Mal kabul onaylanamadı.');
    } finally {
      setIsVerifying(false);
    }
  };

  // If no delivery note is selected yet, show list of incoming delivery notes
  if (!activeNote) {
    return (
      <View style={styles.container}>
        <View style={styles.listHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Mal Kabul Bekleyen İrsaliyeler
          </Text>
          <TouchableOpacity onPress={loadNotes}>
            <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
              İrsaliyeler yükleniyor...
            </Text>
          </View>
        ) : (
          <FlatList
            data={deliveryNotes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.notesListContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.noteCard,
                  {
                    backgroundColor: theme.colors.surfaceCard,
                    borderColor: theme.colors.borderSubtle,
                    borderRadius: theme.borderRadius.lg,
                  },
                ]}
                onPress={() => handleSelectDeliveryNote(item)}
                activeOpacity={0.7}
              >
                <View style={styles.noteTop}>
                  <View style={styles.noteNumRow}>
                    <Ionicons name="document-text-outline" size={16} color={theme.colors.primary} />
                    <Text style={[styles.noteNumber, { color: theme.colors.text }]}>
                      {item.number}
                    </Text>
                  </View>
                  <Badge label={item.status} variant="warning" size="sm" />
                </View>

                <View style={styles.noteBottom}>
                  <Text style={[styles.noteSupplier, { color: theme.colors.textSecondary }]}>
                    {item.contact?.name || 'Tedarikçi Belirtilmedi'}
                  </Text>
                  <Text style={[styles.noteDate, { color: theme.colors.textMuted }]}>
                    {formatDate(item.date || item.issueDate || '')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Ionicons name="checkbox-outline" size={44} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                  Bekleyen İrsaliye Yok
                </Text>
                <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                  Şu anda mal kabul için bekleyen açık bir irsaliye bulunmuyor.
                </Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  // Active Verification Session
  return (
    <View style={styles.container}>
      {/* Active Note Banner */}
      <View
        style={[
          styles.activeNoteBanner,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.lg,
            ...theme.shadows.sm,
          },
        ]}
      >
        <View style={styles.activeNoteLeft}>
          <Text style={[styles.activeNoteLabel, { color: theme.colors.textMuted }]}>
            DOĞRULANAN İRSALİYE
          </Text>
          <Text style={[styles.activeNoteNumber, { color: theme.colors.text }]}>
            {activeNote.number}
          </Text>
          <Text style={[styles.activeNoteSupplier, { color: theme.colors.textSecondary }]}>
            {activeNote.contact?.name || 'Tedarikçi'} • {formatDate(activeNote.date || activeNote.issueDate || '')}
          </Text>
        </View>

        <TouchableOpacity style={styles.cancelSessionBtn} onPress={handleCancelSession}>
          <Ionicons name="close-circle-outline" size={22} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Progress Metrics Bar */}
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
          <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Toplam</Text>
        </View>

        <View style={[styles.metricDivider, { backgroundColor: theme.colors.borderSubtle }]} />

        <View style={styles.metricItem}>
          <Text style={[styles.metricNum, { color: theme.colors.success }]}>
            {summary.exactMatches}
          </Text>
          <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Doğrulandı</Text>
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
          <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Eksik</Text>
        </View>

        <View style={[styles.metricDivider, { backgroundColor: theme.colors.borderSubtle }]} />

        <View style={styles.metricItem}>
          <Text
            style={[
              styles.metricNum,
              { color: summary.unmatchedCount > 0 ? theme.colors.danger : theme.colors.textMuted },
            ]}
          >
            {summary.unmatchedCount}
          </Text>
          <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>Bilinmeyen</Text>
        </View>
      </View>

      {/* Verification Checklist */}
      <FlatList
        data={expectedItems}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isVerified = item.countedQty >= item.expectedQty;
          const isUnder = item.countedQty < item.expectedQty;

          return (
            <View
              style={[
                styles.itemCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: isVerified ? theme.colors.success : theme.colors.borderSubtle,
                  borderLeftWidth: isVerified ? 4 : 1,
                  borderLeftColor: isVerified ? theme.colors.success : theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <View style={styles.itemLeft}>
                <View
                  style={[
                    styles.checkBadge,
                    {
                      backgroundColor: isVerified
                        ? theme.colors.success
                        : theme.colors.borderSubtle,
                    },
                  ]}
                >
                  <Ionicons
                    name={isVerified ? 'checkmark' : 'time-outline'}
                    size={16}
                    color={isVerified ? '#ffffff' : theme.colors.textMuted}
                  />
                </View>

                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text style={[styles.itemCode, { color: theme.colors.textMuted }]}>
                    Kod: {item.productCode} {item.barcode ? `• ${item.barcode}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.itemRight}>
                <Text
                  style={[
                    styles.countText,
                    {
                      color: isVerified ? theme.colors.success : isUnder && item.countedQty > 0 ? theme.colors.warning : theme.colors.text,
                    },
                  ]}
                >
                  {item.countedQty} / {item.expectedQty}
                </Text>
                <Text style={[styles.countLabel, { color: theme.colors.textMuted }]}>Adet</Text>
              </View>
            </View>
          );
        }}
      />

      {/* Bottom Action Bar */}
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
            Kalem Tara
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.verifyBtn,
            {
              backgroundColor: theme.colors.success,
              opacity: isVerifying ? 0.7 : 1,
            },
          ]}
          disabled={isVerifying}
          onPress={handleConfirmDelivery}
          activeOpacity={0.8}
        >
          {isVerifying ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={18} color="#ffffff" />
              <Text style={styles.verifyBtnText}>Kabulü Onayla</Text>
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
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
  },
  notesListContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  noteCard: {
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  noteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteNumber: {
    fontSize: 15,
    fontWeight: '700',
  },
  noteBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteSupplier: {
    fontSize: 12,
    fontWeight: '500',
  },
  noteDate: {
    fontSize: 11,
  },
  activeNoteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 14,
    borderWidth: 1,
  },
  activeNoteLeft: {
    flex: 1,
    marginRight: 10,
  },
  activeNoteLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activeNoteNumber: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  activeNoteSupplier: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelSessionBtn: {
    padding: 4,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
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
  itemRight: {
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 14,
    fontWeight: '800',
  },
  countLabel: {
    fontSize: 10,
    marginTop: 1,
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
  verifyBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  verifyBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
