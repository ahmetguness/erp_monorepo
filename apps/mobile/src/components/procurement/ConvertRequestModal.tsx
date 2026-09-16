import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  PurchaseRequest,
  PurchaseOrder,
  convertRequestToOrder,
  getSuppliers,
} from '../../services/procurement.service';
import { ContactListItem } from '../../services/contact.service';
import { formatCurrency } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  visible: boolean;
  request: PurchaseRequest | null;
  onClose: () => void;
  onConverted: (order: PurchaseOrder) => void;
}

export const ConvertRequestModal: React.FC<Props> = ({
  visible,
  request,
  onClose,
  onConverted,
}) => {
  const { theme } = useTheme();

  const [suppliers, setSuppliers] = useState<ContactListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const loadSuppliersList = useCallback(async (q = '') => {
    setIsLoading(true);
    try {
      const res = await getSuppliers({
        search: q.trim() || undefined,
        limit: 50,
      });
      setSuppliers(res.items);
      if (res.items.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(res.items[0].id);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  }, [selectedSupplierId]);

  useEffect(() => {
    if (visible && request) {
      setSearch('');
      setIsSubmitting(false);
      setSelectedSupplierId(null);
      loadSuppliersList();
    }
  }, [visible, request, loadSuppliersList]);

  if (!request) return null;

  const handleConvert = async () => {
    if (!selectedSupplierId) {
      Alert.alert('Tedarikçi Seçiniz', 'Lütfen siparişin açılacağı tedarikçiyi listeden seçin.');
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplierId);

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const order = await convertRequestToOrder(request.id, {
        contactId: selectedSupplierId,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Sipariş Oluşturuldu',
        `"${order.number}" numaralı resmi satın alma siparişi ${supplier?.name ? `"${supplier.name}" için ` : ''}başarıyla açıldı.`
      );
      onConverted(order);
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Talepten sipariş oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemsCount = request.items?.length || 0;

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
                Talebi Siparişe Dönüştür (PO)
              </Text>
              <Badge label="PO Oluştur" variant="success" size="sm" />
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {request.number} • {itemsCount} Kalem İhtiyaç
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

        {/* Info Banner */}
        <View style={styles.infoBannerWrap}>
          <View style={[styles.infoBanner, { backgroundColor: '#ecfdf5', borderColor: '#10b981' }]}>
            <Ionicons name="information-circle-outline" size={18} color="#059669" />
            <Text style={[styles.infoBannerText, { color: '#047857' }]}>
              Onaylanan satın alma talebindeki ürün kalemleri seçilen tedarikçiye resmi PO (Satın Alma Siparişi) olarak aktarılacaktır.
            </Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Tedarikçi adı veya vergi no ara..."
              placeholderTextColor={theme.colors.textMuted}
              value={search}
              onChangeText={(val) => {
                setSearch(val);
                loadSuppliersList(val);
              }}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearch('');
                  loadSuppliersList('');
                }}
              >
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Supplier List */}
        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
              Tedarikçiler yükleniyor...
            </Text>
          </View>
        ) : (
          <FlatList
            data={suppliers}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isSelected = selectedSupplierId === item.id;
              const currentBal = item.currentBalance ?? 0;

              return (
                <TouchableOpacity
                  style={[
                    styles.supplierRow,
                    {
                      backgroundColor: isSelected ? theme.colors.surface : theme.colors.surfaceCard,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedSupplierId(item.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowLeft}>
                    <View
                      style={[
                        styles.radioCircle,
                        {
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {isSelected && <View style={styles.radioInner} />}
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.suppName, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.suppMeta, { color: theme.colors.textMuted }]}>
                        {item.code ? `Kod: ${item.code} • ` : ''}
                        Bakiye: {formatCurrency(Math.abs(currentBal))} {currentBal < 0 ? '(Borçlu)' : ''}
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'chevron-forward'}
                    size={20}
                    color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                  />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="business-outline" size={44} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                  Tedarikçi Bulunamadı
                </Text>
                <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                  Siparişe bağlamak için sistemde en az 1 tedarikçi tanımlı olmalıdır.
                </Text>
              </View>
            }
          />
        )}

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
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: theme.colors.border }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor: selectedSupplierId ? '#059669' : theme.colors.borderSubtle,
              },
            ]}
            onPress={handleConvert}
            disabled={isSubmitting || !selectedSupplierId}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="cart-outline" size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>Siparişe Dönüştür</Text>
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
  infoBannerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoBannerText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  suppName: {
    fontSize: 13,
    fontWeight: '700',
  },
  suppMeta: {
    fontSize: 11,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
