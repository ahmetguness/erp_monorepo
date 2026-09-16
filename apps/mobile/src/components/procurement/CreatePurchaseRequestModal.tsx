import React, { useState, useEffect, useCallback } from 'react';
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
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  CreatePurchaseRequestDTO,
  createPurchaseRequest,
  PurchaseRequest,
} from '../../services/procurement.service';
import { getProducts, ProductLookup } from '../../services/inventory.service';
import { formatCurrency } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  visible: boolean;
  onClose: () => void;
  onRequestCreated: (request: PurchaseRequest) => void;
  initialSupplierName?: string;
}

interface RequestItemInput {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  barcode?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export const CreatePurchaseRequestModal: React.FC<Props> = ({
  visible,
  onClose,
  onRequestCreated,
  initialSupplierName,
}) => {
  const { theme } = useTheme();

  const [notes, setNotes] = useState('');
  const [urgency, setUrgency] = useState<'NORMAL' | 'HIGH' | 'CRITICAL'>('NORMAL');
  const [items, setItems] = useState<RequestItemInput[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Product Picker state
  const [productPickerVisible, setProductPickerVisible] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Load products list for picker
  const loadProductOptions = useCallback(async (query = '') => {
    setIsLoadingProducts(true);
    try {
      const list = await getProducts({
        search: query.trim() || undefined,
        limit: 50,
      });
      setProducts(list);
    } catch {
      // Non-fatal fallback
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setNotes(initialSupplierName ? `Önerilen Tedarikçi: ${initialSupplierName}` : '');
      setUrgency('NORMAL');
      setItems([]);
      setIsSubmitting(false);
      setProductSearch('');
      loadProductOptions();
    }
  }, [visible, initialSupplierName, loadProductOptions]);

  const handleOpenProductPicker = (index: number | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveItemIndex(index);
    setProductSearch('');
    setProductPickerVisible(true);
    loadProductOptions();
  };

  const handleSelectProduct = (product: ProductLookup) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (activeItemIndex !== null && activeItemIndex < items.length) {
      // Update existing item
      setItems((prev) =>
        prev.map((it, idx) =>
          idx === activeItemIndex
            ? {
                ...it,
                productId: product.id,
                productName: product.name,
                productCode: product.code,
                barcode: product.barcode,
                description: product.name,
                unitPrice: product.purchasePrice || 0,
              }
            : it
        )
      );
    } else {
      // Add new item
      setItems((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          barcode: product.barcode,
          description: product.name,
          quantity: 1,
          unitPrice: product.purchasePrice || 0,
        },
      ]);
    }

    setProductPickerVisible(false);
    setActiveItemIndex(null);
  };

  const handleRemoveItem = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof RequestItemInput, value: any) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  const totalEstimated = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );

  const handleSubmit = async () => {
    if (items.length === 0) {
      Alert.alert('Ürün Ekleyiniz', 'Talebinizde en az 1 kalem ürün bulunmalıdır.');
      return;
    }

    const invalidItem = items.find((i) => !i.productId);
    if (invalidItem) {
      Alert.alert(
        'Katalogdan Ürün Seçiniz',
        'Tüm kalemler için sistem kataloğundan geçerli bir ürün seçilmelidir.'
      );
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const urgencyNote =
        urgency === 'CRITICAL'
          ? '[ACİL/KRİTİK İHTİYAÇ] '
          : urgency === 'HIGH'
          ? '[YÜKSEK ÖNCELİK] '
          : '';
      const fullNotes = `${urgencyNote}${notes.trim()}`.trim();

      const payload: CreatePurchaseRequestDTO = {
        date: new Date().toISOString(),
        notes: fullNotes || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          description: i.description.trim() || undefined,
          quantity: Math.max(1, Number(i.quantity) || 1),
          unitPrice: Number(i.unitPrice) > 0 ? Number(i.unitPrice) : undefined,
        })),
      };

      const result = await createPurchaseRequest(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Talep Oluşturuldu',
        `"${result.number}" numaralı satın alma talebi yöneticinizin onayına iletildi.`
      );
      onRequestCreated(result);
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Talep oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Yeni Satın Alma Talebi (PR)
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                Depo veya saha ihtiyacınızı onaya gönderin
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
            {/* Urgency Selection */}
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
                ÖNCELİK & ACİLİYET DERECESİ
              </Text>

              <View style={styles.urgencyRow}>
                {[
                  { key: 'NORMAL', label: 'Normal', color: '#3b82f6' },
                  { key: 'HIGH', label: 'Yüksek', color: '#f59e0b' },
                  { key: 'CRITICAL', label: 'Kritik / Acil', color: '#ef4444' },
                ].map((u) => {
                  const isSelected = urgency === u.key;
                  return (
                    <TouchableOpacity
                      key={u.key}
                      style={[
                        styles.urgencyChip,
                        {
                          backgroundColor: isSelected ? u.color : theme.colors.surface,
                          borderColor: isSelected ? u.color : theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setUrgency(u.key as any);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.urgencyText,
                          { color: isSelected ? '#ffffff' : theme.colors.text },
                        ]}
                      >
                        {u.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Items Section */}
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
                  TALEP EDİLEN ÜRÜNLER ({items.length})
                </Text>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: theme.colors.primaryMuted }]}
                  onPress={() => handleOpenProductPicker(null)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={14} color={theme.colors.primary} />
                  <Text style={[styles.addBtnText, { color: theme.colors.primary }]}>
                    Katalogdan Ürün Ekle
                  </Text>
                </TouchableOpacity>
              </View>

              {items.length === 0 ? (
                <TouchableOpacity
                  style={[styles.emptyItemBox, { borderColor: theme.colors.borderSubtle }]}
                  onPress={() => handleOpenProductPicker(null)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="cube-outline" size={28} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyItemTitle, { color: theme.colors.text }]}>
                    Henüz Ürün Kalemi Eklenmedi
                  </Text>
                  <Text style={[styles.emptyItemDesc, { color: theme.colors.textMuted }]}>
                    Dokunarak sistem kataloğundan ürün seçin ve miktarı belirleyin.
                  </Text>
                </TouchableOpacity>
              ) : (
                items.map((it, idx) => (
                  <View
                    key={it.id}
                    style={[
                      styles.itemBox,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.borderSubtle,
                      },
                    ]}
                  >
                    <View style={styles.itemTopRow}>
                      <View style={styles.itemBadgeWrap}>
                        <Text style={[styles.itemIdx, { color: theme.colors.textMuted }]}>
                          #{idx + 1}
                        </Text>
                        <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                          {it.productName}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveItem(it.id)}>
                        <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </View>

                    {/* SKU and Change product link */}
                    <View style={styles.productSubRow}>
                      <Text style={[styles.productSku, { color: theme.colors.textMuted }]}>
                        Kod: {it.productCode || '-'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleOpenProductPicker(idx)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.changeLink, { color: theme.colors.primary }]}>
                          Ürünü Değiştir
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Quantity and Price row */}
                    <View style={styles.qtyPriceRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                          Miktar
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: theme.colors.surfaceCard,
                              borderColor: theme.colors.border,
                              color: theme.colors.text,
                            },
                          ]}
                          placeholder="1"
                          placeholderTextColor={theme.colors.textMuted}
                          keyboardType="numeric"
                          value={String(it.quantity)}
                          onChangeText={(val) =>
                            handleUpdateItem(it.id, 'quantity', parseInt(val, 10) || 1)
                          }
                        />
                      </View>

                      <View style={{ flex: 1.5 }}>
                        <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                          Tahmini Birim Fiyat (TL)
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: theme.colors.surfaceCard,
                              borderColor: theme.colors.border,
                              color: theme.colors.text,
                            },
                          ]}
                          placeholder="0.00"
                          placeholderTextColor={theme.colors.textMuted}
                          keyboardType="numeric"
                          value={it.unitPrice > 0 ? String(it.unitPrice) : ''}
                          onChangeText={(val) =>
                            handleUpdateItem(it.id, 'unitPrice', parseFloat(val) || 0)
                          }
                        />
                      </View>
                    </View>
                  </View>
                ))
              )}

              {/* Estimated Total Display */}
              {totalEstimated > 0 && (
                <View style={styles.estTotalRow}>
                  <Text style={[styles.estTotalLabel, { color: theme.colors.textMuted }]}>
                    Tahmini Toplam:
                  </Text>
                  <Text style={[styles.estTotalVal, { color: theme.colors.primary }]}>
                    {formatCurrency(totalEstimated)}
                  </Text>
                </View>
              )}
            </View>

            {/* Notes & Justification */}
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
                GEREKÇE & AÇIKLAMA
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Talebin açılma sebebi, önerilen tedarikçi veya projenin adı..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          {/* Footer Submit */}
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
                  backgroundColor: items.length > 0 ? theme.colors.primary : theme.colors.borderSubtle,
                },
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || items.length === 0}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Talebi Onaya Gönder</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Product Picker Modal ── */}
      <Modal
        visible={productPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setProductPickerVisible(false)}
      >
        <SafeAreaView
          style={[styles.container, { backgroundColor: theme.colors.background }]}
          edges={['top', 'bottom']}
        >
          {/* Picker Header */}
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
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Katalogdan Ürün Seç
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                Talebe eklenecek ürünü listeden seçin
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
              onPress={() => setProductPickerVisible(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.pickerSearchWrap}>
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
                placeholder="Ürün adı, kod veya barkod ara..."
                placeholderTextColor={theme.colors.textMuted}
                value={productSearch}
                onChangeText={(val) => {
                  setProductSearch(val);
                  loadProductOptions(val);
                }}
                returnKeyType="search"
              />
              {productSearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setProductSearch('');
                    loadProductOptions('');
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Product list */}
          {isLoadingProducts ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                Ürünler yükleniyor...
              </Text>
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.productListContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.productItemCard,
                    {
                      backgroundColor: theme.colors.surfaceCard,
                      borderColor: theme.colors.borderSubtle,
                    },
                  ]}
                  onPress={() => handleSelectProduct(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.productLeft}>
                    <Text style={[styles.pickerProdName, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.pickerProdMeta, { color: theme.colors.textMuted }]}>
                      Kod: {item.code} {item.barcode ? `• Barkod: ${item.barcode}` : ''}
                    </Text>
                  </View>

                  <View style={styles.productRight}>
                    <Text style={[styles.pickerPrice, { color: theme.colors.primary }]}>
                      {formatCurrency(item.purchasePrice || item.salesPrice || 0)}
                    </Text>
                    <Badge label="Seç" variant="info" size="sm" />
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                    Ürün Bulunamadı
                  </Text>
                  <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                    Arama kriterine uygun ürün bulunamadı.
                  </Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
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
  urgencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  urgencyChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyItemBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  emptyItemTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyItemDesc: {
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  itemBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    marginTop: 6,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  itemIdx: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  productSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  productSku: {
    fontSize: 11,
  },
  changeLink: {
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  qtyPriceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 3,
  },
  estTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  estTotalLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  estTotalVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 65,
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
  pickerSearchWrap: {
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
  productListContent: {
    padding: 16,
    gap: 8,
  },
  productItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  productLeft: {
    flex: 1,
    gap: 2,
  },
  pickerProdName: {
    fontSize: 13,
    fontWeight: '700',
  },
  pickerProdMeta: {
    fontSize: 11,
  },
  productRight: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 10,
  },
  pickerPrice: {
    fontSize: 13,
    fontWeight: '800',
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
    paddingVertical: 60,
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
});
