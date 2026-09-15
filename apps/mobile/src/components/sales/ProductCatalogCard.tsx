import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ProductLookup } from '../../services/inventory.service';
import { Badge } from '../common/Badge';
import { formatCurrency } from '../../lib/utils';

export interface ProductCatalogCardProps {
  product: ProductLookup;
  quantityInCart?: number;
  stockQuantity?: number;
  onIncrement: (product: ProductLookup) => void;
  onDecrement: (product: ProductLookup) => void;
  onPress?: (product: ProductLookup) => void;
}

export const ProductCatalogCard: React.FC<ProductCatalogCardProps> = ({
  product,
  quantityInCart = 0,
  stockQuantity,
  onIncrement,
  onDecrement,
  onPress,
}) => {
  const { theme } = useTheme();

  const handleIncrementPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onIncrement(product);
  };

  const handleDecrementPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onDecrement(product);
  };

  const taxRateVal = product.taxRate?.rate ?? 20;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: quantityInCart > 0 ? theme.colors.primary : theme.colors.borderSubtle,
          borderWidth: quantityInCart > 0 ? 1.5 : 1,
          borderRadius: theme.borderRadius.lg,
          ...theme.shadows.sm,
        },
      ]}
      activeOpacity={0.8}
      onPress={() => onPress?.(product)}
    >
      {/* Top Header */}
      <View style={styles.topRow}>
        <View style={styles.productLeft}>
          <View
            style={[
              styles.productIconBadge,
              { backgroundColor: theme.colors.primaryMuted },
            ]}
          >
            <Ionicons name="cube-outline" size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.productTitles}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {product.name}
            </Text>
            <Text style={[styles.skuText, { color: theme.colors.textMuted }]}>
              SKU: {product.code} {product.barcode ? `• ${product.barcode}` : ''}
            </Text>
          </View>
        </View>

        {product.category && (
          <Badge label={product.category.name} variant="neutral" size="sm" />
        )}
      </View>

      {/* Pricing and Stock Row */}
      <View style={styles.priceRow}>
        <View>
          <Text style={[styles.priceLabel, { color: theme.colors.textMuted }]}>
            BİRİM SATIŞ FİYATI (+% {taxRateVal} KDV)
          </Text>
          <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
            {formatCurrency(product.salesPrice)}
          </Text>
        </View>

        {stockQuantity !== undefined && (
          <View style={styles.stockBadgeWrapper}>
            <Badge
              label={stockQuantity > 0 ? `${stockQuantity} ${product.unit?.code || 'AD'} Stok` : 'Tükendi'}
              variant={stockQuantity > 0 ? 'success' : 'danger'}
              size="sm"
            />
          </View>
        )}
      </View>

      {/* Stepper / Add to Cart Action Row */}
      <View style={styles.actionRow}>
        {quantityInCart === 0 ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleIncrementPress}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={16} color="#ffffff" />
            <Text style={styles.addBtnText}>Sepete Ekle</Text>
          </TouchableOpacity>
        ) : (
          <View
            style={[
              styles.stepperContainer,
              {
                backgroundColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.colors.surfaceCard }]}
              onPress={handleDecrementPress}
              activeOpacity={0.7}
            >
              <Ionicons
                name={quantityInCart === 1 ? 'trash-outline' : 'remove'}
                size={16}
                color={quantityInCart === 1 ? theme.colors.danger : theme.colors.text}
              />
            </TouchableOpacity>

            <View style={styles.stepperValueBox}>
              <Text style={[styles.stepperValue, { color: theme.colors.text }]}>
                {quantityInCart} {product.unit?.code || 'AD'}
              </Text>
              <Text style={[styles.stepperTotal, { color: theme.colors.primary }]}>
                {formatCurrency(quantityInCart * product.salesPrice)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.stepperBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleIncrementPress}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  productLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 6,
  },
  productIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productTitles: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  skuText: {
    fontSize: 11,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  stockBadgeWrapper: {
    alignItems: 'flex-end',
  },
  actionRow: {
    paddingTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 4,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueBox: {
    alignItems: 'center',
    flex: 1,
  },
  stepperValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  stepperTotal: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
});
