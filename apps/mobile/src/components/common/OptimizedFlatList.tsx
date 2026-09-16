import React, { forwardRef } from 'react';
import {
  FlatList,
  FlatListProps,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

export interface OptimizedFlatListProps<ItemT> extends FlatListProps<ItemT> {
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  emptyContainerStyle?: StyleProp<ViewStyle>;
  isLoadingMore?: boolean;
}

/**
 * Creates a precomputed getItemLayout function for fixed-height list items.
 * Bypasses async layout calculation, allowing instant 60 FPS scrolling and scrollToIndex.
 */
export function createFixedItemLayout<T>(itemHeight: number, separatorHeight = 0) {
  const totalHeight = itemHeight + separatorHeight;
  return (_data: ArrayLike<T> | null | undefined, index: number) => ({
    length: totalHeight,
    offset: totalHeight * index,
    index,
  });
}

function OptimizedFlatListInner<ItemT>(
  {
    emptyTitle,
    emptyDescription,
    emptyIcon = 'folder-open-outline',
    emptyContainerStyle,
    isLoadingMore = false,
    ListEmptyComponent,
    ListFooterComponent,
    removeClippedSubviews = true,
    maxToRenderPerBatch = 10,
    updateCellsBatchingPeriod = 50,
    initialNumToRender = 10,
    windowSize = 5,
    ...props
  }: OptimizedFlatListProps<ItemT>,
  ref: React.ForwardedRef<FlatList<ItemT>>
) {
  const { theme } = useTheme();

  // Render empty state if provided and not overridden by custom ListEmptyComponent
  const renderEmptyComponent = () => {
    if (ListEmptyComponent) {
      return typeof ListEmptyComponent === 'function' ? (
        <ListEmptyComponent />
      ) : (
        ListEmptyComponent
      );
    }

    if (!emptyTitle && !emptyDescription) {
      return null;
    }

    return (
      <View style={[styles.emptyContainer, emptyContainerStyle]}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.borderSubtle }]}>
          <Ionicons name={emptyIcon} size={36} color={theme.colors.textMuted} />
        </View>
        {emptyTitle && (
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            {emptyTitle}
          </Text>
        )}
        {emptyDescription && (
          <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
            {emptyDescription}
          </Text>
        )}
      </View>
    );
  };

  // Render loading more footer or custom footer
  const renderFooterComponent = () => {
    const customFooter =
      typeof ListFooterComponent === 'function' ? <ListFooterComponent /> : ListFooterComponent;
    if (!customFooter && !isLoadingMore) {
      return null;
    }
    return (
      <View>
        {customFooter}
        {isLoadingMore && (
          <View style={styles.loadingMoreBox}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.loadingMoreText, { color: theme.colors.textSecondary }]}>
              Daha fazla yükleniyor...
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <FlatList
      ref={ref}
      removeClippedSubviews={removeClippedSubviews}
      maxToRenderPerBatch={maxToRenderPerBatch}
      updateCellsBatchingPeriod={updateCellsBatchingPeriod}
      initialNumToRender={initialNumToRender}
      windowSize={windowSize}
      ListEmptyComponent={renderEmptyComponent}
      ListFooterComponent={renderFooterComponent}
      {...props}
    />
  );
}

export const OptimizedFlatList = forwardRef(OptimizedFlatListInner) as <ItemT>(
  props: OptimizedFlatListProps<ItemT> & { ref?: React.ForwardedRef<FlatList<ItemT>> }
) => React.ReactElement;

const styles = StyleSheet.create({
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingMoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
