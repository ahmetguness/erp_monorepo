import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  BankAccount,
  CashAccount,
  BankTransaction,
  getBankTransactions,
} from '../../services/finance.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  visible: boolean;
  account: BankAccount | CashAccount | null;
  isCash?: boolean;
  onClose: () => void;
}

export const BankStatementModal: React.FC<Props> = ({
  visible,
  account,
  isCash = false,
  onClose,
}) => {
  const { theme } = useTheme();

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOMING' | 'OUTGOING'>('ALL');

  const loadTransactions = useCallback(async () => {
    if (!account) return;
    setIsLoading(true);
    try {
      const list = await getBankTransactions({
        bankAccountId: account.id,
        limit: 100,
      });
      setTransactions(list);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (visible && account) {
      setSearch('');
      setTypeFilter('ALL');
      loadTransactions();
    }
  }, [visible, account, loadTransactions]);

  if (!account) return null;

  const bankAccount = !isCash ? (account as BankAccount) : null;
  const currency = bankAccount?.currencyCode || 'TRY';

  const filtered = transactions.filter((t) => {
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchDesc = t.description && t.description.toLowerCase().includes(q);
      const matchSender = t.senderName && t.senderName.toLowerCase().includes(q);
      const matchRef = t.reference && t.reference.toLowerCase().includes(q);
      return matchDesc || matchSender || matchRef;
    }
    return true;
  });

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
                {account.name}
              </Text>
              <Badge label={isCash ? 'KASA' : currency} variant={isCash ? 'success' : 'info'} size="sm" />
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {bankAccount?.iban ? `IBAN: ${bankAccount.iban}` : 'Hesap Hareket Dökümü (Son 30 Gün)'}
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

        {/* Current Balance Banner */}
        <View style={styles.bannerWrap}>
          <View
            style={[
              styles.balanceBanner,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View>
              <Text style={[styles.balanceBannerLabel, { color: theme.colors.textMuted }]}>
                GÜNCEL HESAP BAKİYESİ
              </Text>
              <Text
                style={[
                  styles.balanceBannerValue,
                  { color: Number((account as any)?.balance ?? 0) >= 0 ? '#10b981' : '#ef4444' },
                ]}
              >
                {formatCurrency(Number((account as any)?.balance ?? 0), currency)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: theme.colors.surface }]}
              onPress={loadTransactions}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search & Filter Chips */}
        <View style={styles.filterSection}>
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
              placeholder="Açıklama, gönderen veya referans ara..."
              placeholderTextColor={theme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.chipsRow}>
            {[
              { key: 'ALL', label: 'Tüm Hareketler' },
              { key: 'INCOMING', label: 'Gelenler (+)' },
              { key: 'OUTGOING', label: 'Gidenler (-)' },
            ].map((f) => {
              const isSelected = typeFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceCard,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setTypeFilter(f.key as any);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isSelected ? '#ffffff' : theme.colors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Transaction List */}
        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
              Hareketler yükleniyor...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={loadTransactions} tintColor={theme.colors.primary} />
            }
            renderItem={({ item }) => {
              const isIncoming = item.type === 'INCOMING';

              return (
                <View
                  style={[
                    styles.txRow,
                    {
                      backgroundColor: theme.colors.surfaceCard,
                      borderColor: theme.colors.borderSubtle,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.txIconBox,
                      { backgroundColor: isIncoming ? '#ecfdf5' : '#fee2e2' },
                    ]}
                  >
                    <Ionicons
                      name={isIncoming ? 'arrow-down' : 'arrow-up'}
                      size={16}
                      color={isIncoming ? '#059669' : '#dc2626'}
                    />
                  </View>

                  <View style={styles.txMid}>
                    <Text style={[styles.txDesc, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.description || item.senderName || 'Banka Hareketi'}
                    </Text>
                    <Text style={[styles.txMeta, { color: theme.colors.textMuted }]}>
                      {formatDate(item.date)} {item.reference ? `• Ref: ${item.reference}` : ''}
                    </Text>
                  </View>

                  <View style={styles.txRight}>
                    <Text
                      style={[
                        styles.txAmount,
                        { color: isIncoming ? '#059669' : '#dc2626' },
                      ]}
                    >
                      {isIncoming ? '+' : '-'}{formatCurrency(item.amount, currency)}
                    </Text>
                    {item.balanceAfter !== undefined && (
                      <Text style={[styles.txBalanceAfter, { color: theme.colors.textMuted }]}>
                        Bakiye: {formatCurrency(item.balanceAfter, currency)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="receipt-outline" size={44} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                  Hareket Bulunamadı
                </Text>
                <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                  Seçilen filtrelere uygun hesap hareketi bulunmuyor.
                </Text>
              </View>
            }
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
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  balanceBannerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceBannerValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 1,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  txIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txMid: {
    flex: 1,
    gap: 2,
  },
  txDesc: {
    fontSize: 13,
    fontWeight: '700',
  },
  txMeta: {
    fontSize: 11,
  },
  txRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  txBalanceAfter: {
    fontSize: 10,
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
});
