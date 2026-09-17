import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  GlobalSearchResult,
  SearchCategoryFilter,
  SEARCH_CATEGORIES,
  performGlobalSearch,
  filterResultsByCategory,
  getRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from '../../services/search.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge } from '../common/Badge';

export interface SpotlightSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectResult?: (result: GlobalSearchResult) => void;
  onNavigateToEntity?: (type: string, id: string, extra?: any) => void;
}

function getResultIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  switch (type) {
    case 'contact':
    case 'employee':
      return { name: 'people', color: '#10b981', bg: '#10b98115' };
    case 'product':
    case 'stock_movement':
      return { name: 'cube', color: '#f59e0b', bg: '#f59e0b15' };
    case 'sales_order':
    case 'sales_quote':
      return { name: 'cart', color: '#2563eb', bg: '#2563eb15' };
    case 'purchase_order':
      return { name: 'bag-handle', color: '#0284c7', bg: '#0284c715' };
    case 'invoice':
    case 'payment':
    case 'document':
      return { name: 'receipt', color: '#8b5cf6', bg: '#8b5cf615' };
    case 'service_request':
      return { name: 'construct', color: '#ec4899', bg: '#ec489915' };
    case 'task':
    case 'action':
      return { name: 'flash', color: '#6366f1', bg: '#6366f115' };
    default:
      return { name: 'search', color: '#64748b', bg: '#64748b15' };
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'contact':
      return 'Cari Kart';
    case 'employee':
      return 'Personel';
    case 'product':
      return 'Ürün';
    case 'stock_movement':
      return 'Stok Hrk.';
    case 'sales_order':
      return 'Satış Siparişi';
    case 'sales_quote':
      return 'Satış Teklifi';
    case 'purchase_order':
      return 'Satın Alma';
    case 'invoice':
      return 'Fatura';
    case 'payment':
      return 'Ödeme / Tahsilat';
    case 'document':
      return 'Belge';
    case 'service_request':
      return 'Servis Talebi';
    case 'task':
      return 'Görev';
    case 'action':
      return 'Hızlı İşlem';
    default:
      return 'Kayıt';
  }
}

export const SpotlightSearchModal: React.FC<SpotlightSearchModalProps> = ({
  visible,
  onClose,
  onSelectResult,
  onNavigateToEntity,
}) => {
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategoryFilter>('ALL');
  const [allResults, setAllResults] = useState<GlobalSearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load recent searches when opening modal
  useEffect(() => {
    if (visible) {
      getRecentSearches().then(setRecentSearches).catch(() => {});
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    } else {
      setSearchQuery('');
      setAllResults([]);
      setActiveCategory('ALL');
    }
  }, [visible]);

  // Debounced search trigger
  const executeSearch = useCallback(async (query: string) => {
    const clean = query.trim();
    if (!clean || clean.length < 2) {
      setAllResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await performGlobalSearch(clean, 25);
      setAllResults(response.results);
    } catch {
      setAllResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text.trim() || text.trim().length < 2) {
      setAllResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(text);
    }, 280);
  };

  const handleSelectRecent = (term: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSearchQuery(term);
    executeSearch(term);
  };

  const handleRemoveRecent = async (term: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const updated = await removeRecentSearch(term);
    setRecentSearches(updated);
  };

  const handleClearRecent = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await clearRecentSearches();
    setRecentSearches([]);
  };

  const handleItemPress = (item: GlobalSearchResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Keyboard.dismiss();

    // Save search term to history
    if (searchQuery.trim().length >= 2) {
      saveRecentSearch(searchQuery.trim()).then(setRecentSearches).catch(() => {});
    }

    onClose();

    if (onSelectResult) {
      onSelectResult(item);
    }

    if (onNavigateToEntity) {
      onNavigateToEntity(item.type, item.id, item);
    }
  };

  const filteredResults = filterResultsByCategory(allResults, activeCategory);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'bottom']}
      >
        {/* ── Spotlight Search Header ── */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderBottomColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <View
            style={[
              styles.searchBarWrap,
              {
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.primary,
              },
            ]}
          >
            <Ionicons name="search" size={18} color={theme.colors.primary} />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: theme.colors.text }]}
              placeholder="Müşteri, ürün, fatura, sipariş veya iş emri..."
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={handleQueryChange}
              returnKeyType="search"
              clearButtonMode="never"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {isLoading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setAllResults([]);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              Keyboard.dismiss();
              onClose();
            }}
          >
            <Text style={[styles.cancelBtnText, { color: theme.colors.primary }]}>Vazgeç</Text>
          </TouchableOpacity>
        </View>

        {/* ── Category Filter Chips ── */}
        {allResults.length > 0 && (
          <View
            style={[
              styles.categoriesBar,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderBottomColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={SEARCH_CATEGORIES}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.categoryChipsRow}
              renderItem={({ item }) => {
                const isSelected = activeCategory === item.key;
                const count = filterResultsByCategory(allResults, item.key).length;

                return (
                  <TouchableOpacity
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.borderSubtle,
                        borderColor: isSelected ? theme.colors.primary : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setActiveCategory(item.key);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={14}
                      color={isSelected ? '#ffffff' : theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.categoryChipLabel,
                        {
                          color: isSelected ? '#ffffff' : theme.colors.text,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {count > 0 && (
                      <View
                        style={[
                          styles.chipBadge,
                          {
                            backgroundColor: isSelected
                              ? '#ffffff35'
                              : theme.colors.background,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipBadgeText,
                            { color: isSelected ? '#ffffff' : theme.colors.textMuted },
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* ── Search Results or Recent Searches ── */}
        {searchQuery.trim().length < 2 ? (
          /* Recent Searches & Quick Guide */
          <View style={styles.recentSection}>
            {recentSearches.length > 0 ? (
              <View style={styles.recentHeaderRow}>
                <View style={styles.recentTitleGroup}>
                  <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={[styles.recentSectionTitle, { color: theme.colors.textSecondary }]}>
                    Son Aramalar
                  </Text>
                </View>
                <TouchableOpacity onPress={handleClearRecent}>
                  <Text style={[styles.clearRecentText, { color: theme.colors.primary }]}>
                    Temizle
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {recentSearches.length > 0 ? (
              <View style={styles.recentTagsWrap}>
                {recentSearches.map((term, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.recentTag,
                      {
                        backgroundColor: theme.colors.surfaceCard,
                        borderColor: theme.colors.borderSubtle,
                      },
                    ]}
                    onPress={() => handleSelectRecent(term)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="search-outline" size={13} color={theme.colors.textMuted} />
                    <Text style={[styles.recentTagText, { color: theme.colors.text }]}>
                      {term}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveRecent(term)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close" size={14} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.emptyStateContainer}>
                <View
                  style={[
                    styles.emptyIconCircle,
                    { backgroundColor: theme.colors.primaryMuted },
                  ]}
                >
                  <Ionicons name="sparkles" size={32} color={theme.colors.primary} />
                </View>
                <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>
                  Global Spotlight Arama
                </Text>
                <Text style={[styles.emptyStateDesc, { color: theme.colors.textMuted }]}>
                  Tüm ERP sistemindeki müşterileri, ürünleri, siparişleri, faturaları ve servisleri tek noktadan anında bulun.
                </Text>

                {/* Search scope hints */}
                <View style={styles.hintTagsRow}>
                  {['Müşteri / Cari', 'Stok & Barkod', 'Sipariş No', 'Fatura', 'İş Emri'].map(
                    (hint, hIdx) => (
                      <View
                        key={hIdx}
                        style={[
                          styles.hintTag,
                          {
                            backgroundColor: theme.colors.surfaceCard,
                            borderColor: theme.colors.borderSubtle,
                          },
                        ]}
                      >
                        <Text style={[styles.hintTagText, { color: theme.colors.textMuted }]}>
                          • {hint}
                        </Text>
                      </View>
                    )
                  )}
                </View>
              </View>
            )}
          </View>
        ) : filteredResults.length === 0 && !isLoading ? (
          /* No Results Found */
          <View style={styles.emptyStateContainer}>
            <Ionicons name="search-outline" size={48} color={theme.colors.textMuted} />
            <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>
              Sonuç Bulunamadı
            </Text>
            <Text style={[styles.emptyStateDesc, { color: theme.colors.textMuted }]}>
              "{searchQuery}" araması için eşleşen kayıt bulunamadı. Lütfen kelimeyi kontrol edin veya farklı bir terim deneyin.
            </Text>
          </View>
        ) : (
          /* Results FlatList */
          <FlatList
            data={filteredResults}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            contentContainerStyle={styles.resultsListContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const iconInfo = getResultIcon(item.type);
              const typeLabel = getTypeLabel(item.type);

              return (
                <TouchableOpacity
                  style={[
                    styles.resultCard,
                    {
                      backgroundColor: theme.colors.surfaceCard,
                      borderColor: theme.colors.borderSubtle,
                      borderRadius: theme.borderRadius.md,
                    },
                  ]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.resultIconWrap, { backgroundColor: iconInfo.bg }]}>
                    <Ionicons name={iconInfo.name} size={20} color={iconInfo.color} />
                  </View>

                  <View style={styles.resultInfo}>
                    <View style={styles.resultTopRow}>
                      <Text style={[styles.resultTypeBadge, { color: iconInfo.color }]}>
                        {typeLabel}
                      </Text>
                      {Boolean(item.status) && (
                        <Badge label={item.status!} variant="neutral" size="sm" />
                      )}
                    </View>

                    <Text
                      style={[styles.resultTitle, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>

                    {Boolean(item.subtitle) && (
                      <Text
                        style={[styles.resultSubtitle, { color: theme.colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {item.subtitle}
                      </Text>
                    )}

                    {/* Metadata tags: amount or date */}
                    {(item.amount || item.date) && (
                      <View style={styles.metaRow}>
                        {Boolean(item.amount) && (
                          <Text style={[styles.metaAmountText, { color: theme.colors.primary }]}>
                            {item.amount}
                          </Text>
                        )}
                        {Boolean(item.date) && (
                          <Text style={[styles.metaDateText, { color: theme.colors.textMuted }]}>
                            {formatDate(item.date!)}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.colors.textMuted}
                    style={styles.chevronIcon}
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  searchBarWrap: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoriesBar: {
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  categoryChipsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  categoryChipLabel: {
    fontSize: 12,
  },
  chipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  recentSection: {
    flex: 1,
    padding: 20,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  recentTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearRecentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recentTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  recentTagText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  hintTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  hintTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  hintTagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  resultsListContent: {
    padding: 16,
    gap: 10,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  resultIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  resultTypeBadge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  metaAmountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaDateText: {
    fontSize: 11,
  },
  chevronIcon: {
    marginLeft: 4,
  },
});
