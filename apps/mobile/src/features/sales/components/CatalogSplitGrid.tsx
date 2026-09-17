// apps/mobile/src/features/sales/components/CatalogSplitGrid.tsx

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { ProductLookup } from '../../../services/inventory.service';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { Badge } from '../../../components/common/Badge';
import { formatCurrency } from '../../../lib/utils';

export interface CatalogSplitGridProps {
  products: ProductLookup[];
  isLoading: boolean;
  cartQuantities: Record<string, number>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  onIncrement: (product: ProductLookup) => void;
  onDecrement: (product: ProductLookup) => void;
  onOpenScanner: () => void;
}

export const CatalogSplitGrid: React.FC<CatalogSplitGridProps> = ({
  products,
  isLoading,
  cartQuantities,
  searchQuery,
  onSearchChange,
  onRefresh,
  onIncrement,
  onDecrement,
  onOpenScanner,
}) => {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Categories extracted from products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category?.name) set.add(p.category.name);
    });
    return ['ALL', ...Array.from(set)];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat =
        selectedCategory === 'ALL' || p.category?.name === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchQuery));
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const renderProductCard = ({ item }: { item: ProductLookup }) => {
    const qty = cartQuantities[item.id] || 0;
    const inCart = qty > 0;

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface0,
            borderColor: inCart ? theme.colors.primary : theme.colors.glassBorder,
          },
          inCart && {
            borderWidth: 1.5,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 4,
          },
        ]}
      >
        {/* Card Header: Category & Stock */}
        <View style={styles.cardHeader}>
          <Text
            style={[styles.categoryText, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {item.category?.name || 'Genel'}
          </Text>
          <Badge
            label={item.isActive ? 'Stokta' : 'Pasif'}
            variant={item.isActive ? 'success' : 'neutral'}
            size="sm"
          />
        </View>

        {/* Product Details */}
        <View style={styles.cardBody}>
          <Text style={[styles.productCode, { color: theme.colors.primary }]}>
            {item.code}
          </Text>
          <Text
            style={[styles.productName, { color: theme.colors.textPrimary }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
        </View>

        {/* Card Footer: Price & Stepper */}
        <View style={styles.cardFooter}>
          <View>
            <Text style={[styles.unitLabel, { color: theme.colors.textMuted }]}>
              Birim Fiyat ({item.unit?.code || 'AD'})
            </Text>
            <TabularText style={[styles.priceText, { color: theme.colors.textPrimary }]}>
              {formatCurrency(item.salesPrice)}
            </TabularText>
          </View>

          {inCart ? (
            <View
              style={[
                styles.stepperWrap,
                {
                  backgroundColor: theme.colors.surface2,
                  borderColor: theme.colors.glassBorder,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onDecrement(item);
                }}
                style={styles.stepperBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={14} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TabularText style={[styles.stepperQty, { color: theme.colors.primary }]}>
                {qty}
              </TabularText>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onIncrement(item);
                }}
                style={styles.stepperBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={14} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ) : (
            <SpringPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onIncrement(item);
              }}
              style={[
                styles.addBtn,
                {
                  backgroundColor: theme.colors.primary,
                },
              ]}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Ekle</Text>
            </SpringPressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Controls: Search Bar & Barcode Scanner Button */}
      <View style={styles.topControls}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.colors.surface0,
              borderColor: theme.colors.glassBorder,
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.textPrimary }]}
            placeholder="Ürün adı, kod veya barkod ara..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={onSearchChange}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.scannerBtn,
            {
              backgroundColor: theme.colors.surface0,
              borderColor: theme.colors.glassBorder,
            },
          ]}
          onPress={onOpenScanner}
          activeOpacity={0.7}
        >
          <Ionicons name="barcode-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.scannerBtnText, { color: theme.colors.primary }]}>
            Barkod
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category Pills */}
      {categories.length > 1 && (
        <View style={styles.categoryScrollWrap}>
          <FlatList
            horizontal
            data={categories}
            keyExtractor={(cat) => cat}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryList}
            renderItem={({ item: cat }) => {
              const isActive = selectedCategory === cat;
              return (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedCategory(cat);
                  }}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isActive
                        ? theme.colors.primary
                        : theme.colors.surface0,
                      borderColor: isActive
                        ? theme.colors.primary
                        : theme.colors.glassBorder,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      {
                        color: isActive ? '#FFFFFF' : theme.colors.textSecondary,
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}
                  >
                    {cat === 'ALL' ? 'Tüm Ürünler' : cat}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* 3-Column Products Grid */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
            Katalog yükleniyor...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          key="split-grid-3"
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          onRefresh={onRefresh}
          refreshing={isLoading}
          renderItem={renderProductCard}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                Ürün Bulunamadı
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                Arama veya kategori kriterine uygun ürün bulunamadı.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  topControls: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  scannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  scannerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryScrollWrap: {
    height: 36,
  },
  categoryList: {
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  categoryChipText: {
    fontSize: 12,
  },
  gridContent: {
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    flex: 1 / 3,
    marginHorizontal: 4,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    justifyContent: 'space-between',
    minHeight: 160,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
    marginRight: 4,
  },
  cardBody: {
    gap: 2,
    marginBottom: 10,
  },
  productCode: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 8,
    marginTop: 'auto',
  },
  unitLabel: {
    fontSize: 9,
    fontWeight: '500',
    marginBottom: 2,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '800',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 6,
  },
  stepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    fontSize: 12,
    fontWeight: '800',
    minWidth: 16,
    textAlign: 'center',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    minHeight: 200,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 240,
  },
});
