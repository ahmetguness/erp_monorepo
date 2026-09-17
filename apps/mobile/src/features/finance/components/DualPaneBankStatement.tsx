// apps/mobile/src/features/finance/components/DualPaneBankStatement.tsx

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { BankAccount } from '../../../services/finance.service';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { Badge } from '../../../components/common/Badge';
import { formatCurrency, formatDate } from '../../../lib/utils';

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  type: 'INCOME' | 'EXPENSE' | 'POS_COMMISSION';
  amount: number;
  balanceAfter: number;
  reference?: string;
}

export interface DualPaneBankStatementProps {
  accounts: BankAccount[];
  selectedAccountId?: string | null;
  onSelectAccount?: (acc: BankAccount) => void;
  transactions?: BankTransaction[];
  isLoading?: boolean;
}

// Realistic 30-day mock transactions generator if none passed
const generateDemoTransactions = (account: BankAccount): BankTransaction[] => {
  const baseBalance = account.balance || 450000;
  return [
    {
      id: 'tx-1',
      date: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      description: 'EFT: Yılmaz Makine Ltd. Şti. - Fatura Tahsilatı',
      type: 'INCOME',
      amount: 45000,
      balanceAfter: baseBalance,
      reference: 'EFT-88492',
    },
    {
      id: 'tx-2',
      date: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
      description: 'Günün Sonu POS Otomatik Virmanı',
      type: 'INCOME',
      amount: 18450,
      balanceAfter: baseBalance - 45000,
      reference: 'POS-VIR-091',
    },
    {
      id: 'tx-3',
      date: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      description: 'POS Hizmet & Takas Komisyon Kesintisi (%1.79)',
      type: 'POS_COMMISSION',
      amount: 330.25,
      balanceAfter: baseBalance - 63450,
      reference: 'KOM-3391',
    },
    {
      id: 'tx-4',
      date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      description: 'Havale: Akdeniz Endüstriyel Hammadde Alımı',
      type: 'EXPENSE',
      amount: 72000,
      balanceAfter: baseBalance - 63780.25,
      reference: 'TR-HAV-491',
    },
    {
      id: 'tx-5',
      date: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      description: 'Vergi Dairesi SGK & Muhtasar Otomatik Ödeme',
      type: 'EXPENSE',
      amount: 28900,
      balanceAfter: baseBalance + 8219.75,
      reference: 'VD-SGK-2026',
    },
    {
      id: 'tx-6',
      date: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
      description: 'FAST: Müşteri Depozito Teminatı',
      type: 'INCOME',
      amount: 15000,
      balanceAfter: baseBalance + 37119.75,
      reference: 'FAST-19283',
    },
  ];
};

type TxFilter = 'ALL' | 'INCOME' | 'EXPENSE' | 'POS_COMMISSION';

export const DualPaneBankStatement: React.FC<DualPaneBankStatementProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  transactions,
  isLoading = false,
}) => {
  const { theme } = useTheme();

  const [activeAccount, setActiveAccount] = useState<BankAccount | null>(
    accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null
  );

  const [txFilter, setTxFilter] = useState<TxFilter>('ALL');

  const accountTransactions = useMemo(() => {
    if (transactions && transactions.length > 0) return transactions;
    if (activeAccount) return generateDemoTransactions(activeAccount);
    return [];
  }, [transactions, activeAccount]);

  const filteredTransactions = useMemo(() => {
    if (txFilter === 'ALL') return accountTransactions;
    return accountTransactions.filter((tx) => tx.type === txFilter);
  }, [accountTransactions, txFilter]);

  const handleAccountPress = (acc: BankAccount) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveAccount(acc);
    onSelectAccount?.(acc);
  };

  const handleCopyIBAN = (iban?: string | null) => {
    if (!iban) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Share.share({ message: iban }).catch(() => {});
  };

  const handleShareStatement = () => {
    if (!activeAccount) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Share.share({
      title: `${activeAccount.bankName || 'Banka'} Hesap Özeti`,
      message: `${activeAccount.name} (${activeAccount.iban || ''})\nGüncel Bakiye: ${formatCurrency(
        activeAccount.balance || 0,
        activeAccount.currencyCode || 'TRY'
      )}\nERP Mobil Finans Raporu`,
    }).catch(() => {});
  };

  // Mock POS blockage for demo: 3% of balance or 14.500
  const posBlockage = (activeAccount?.balance || 0) > 50000 ? 14500 : 0;

  return (
    <View style={styles.container}>
      {/* ── Left Pane: Bank Accounts List (40% width) ── */}
      <View
        style={[
          styles.leftPane,
          {
            backgroundColor: theme.colors.surface0,
            borderColor: theme.colors.glassBorder,
          },
        ]}
      >
        <View style={styles.paneHeader}>
          <Text style={[styles.paneTitle, { color: theme.colors.textPrimary }]}>
            Banka Hesapları ({accounts.length})
          </Text>
          <Text style={[styles.paneSub, { color: theme.colors.textMuted }]}>
            Anlık Bakiye ve POS Blokajları
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.accountsList}>
          {accounts.map((acc) => {
            const isSelected = activeAccount?.id === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                onPress={() => handleAccountPress(acc)}
                style={[
                  styles.accountCard,
                  {
                    backgroundColor: theme.colors.surface1,
                    borderColor: isSelected ? theme.colors.primary : theme.colors.glassBorder,
                  },
                  isSelected && {
                    borderWidth: 1.5,
                    shadowColor: theme.colors.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 5,
                  },
                ]}
                activeOpacity={0.8}
              >
                <View style={styles.accTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bankName, { color: theme.colors.primary }]}>
                      {acc.bankName || 'Banka'}
                    </Text>
                    <Text
                      style={[styles.accName, { color: theme.colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {acc.name}
                    </Text>
                  </View>
                  <Badge label={acc.currencyCode || 'TRY'} variant="primary" size="sm" />
                </View>

                {/* Balance */}
                <View style={styles.balanceRow}>
                  <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>
                    Kullanılabilir:
                  </Text>
                  <TabularText style={[styles.balanceVal, { color: theme.colors.textPrimary }]}>
                    {formatCurrency(acc.balance || 0, acc.currencyCode || 'TRY')}
                  </TabularText>
                </View>

                {/* POS Blockage Pill */}
                {posBlockage > 0 && (
                  <View
                    style={[
                      styles.posPill,
                      {
                        backgroundColor: 'rgba(245, 158, 11, 0.12)',
                        borderColor: 'rgba(245, 158, 11, 0.3)',
                      },
                    ]}
                  >
                    <Ionicons name="lock-closed" size={11} color={theme.colors.amberPulse} />
                    <Text style={[styles.posPillText, { color: theme.colors.amberPulse }]}>
                      POS Bloke: {formatCurrency(posBlockage)} (Çözülme: Yarın)
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Right Pane: 30-Day Statement & Transactions (60% width) ── */}
      <View
        style={[
          styles.rightPane,
          {
            backgroundColor: theme.colors.surface0,
            borderColor: theme.colors.glassBorder,
          },
        ]}
      >
        {activeAccount ? (
          <View style={styles.statementContent}>
            {/* Right Pane Header: Account summary + Actions */}
            <View
              style={[
                styles.statementHeader,
                {
                  backgroundColor: theme.colors.surface1,
                  borderColor: theme.colors.glassBorder,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.statementBank, { color: theme.colors.primary }]}>
                  {activeAccount.bankName} · {activeAccount.branchName || 'Merkez Şube'}
                </Text>
                <Text style={[styles.statementAccName, { color: theme.colors.textPrimary }]}>
                  {activeAccount.name}
                </Text>
                {activeAccount.iban && (
                  <TouchableOpacity
                    onPress={() => handleCopyIBAN(activeAccount.iban)}
                    style={styles.ibanRow}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.ibanText, { color: theme.colors.textSecondary }]}>
                      {activeAccount.iban}
                    </Text>
                    <Ionicons name="copy-outline" size={13} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.headerRightCol}>
                <TabularText style={[styles.headerBalance, { color: theme.colors.textPrimary }]}>
                  {formatCurrency(activeAccount.balance || 0, activeAccount.currencyCode || 'TRY')}
                </TabularText>

                <SpringPressable
                  onPress={handleShareStatement}
                  style={[
                    styles.shareBtn,
                    {
                      backgroundColor: theme.colors.surface2,
                      borderColor: theme.colors.glassBorder,
                    },
                  ]}
                >
                  <Ionicons name="share-outline" size={14} color={theme.colors.textPrimary} />
                  <Text style={[styles.shareBtnText, { color: theme.colors.textPrimary }]}>
                    Ekstre Paylaş
                  </Text>
                </SpringPressable>
              </View>
            </View>

            {/* Filter Tabs Strip */}
            <View style={styles.txFilterRow}>
              {[
                { key: 'ALL' as TxFilter, label: 'Tüm Hareketler' },
                { key: 'INCOME' as TxFilter, label: 'Giriş (+)' },
                { key: 'EXPENSE' as TxFilter, label: 'Çıkış (-)' },
                { key: 'POS_COMMISSION' as TxFilter, label: 'POS Komisyon' },
              ].map((f) => {
                const isActive = txFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setTxFilter(f.key);
                    }}
                    style={[
                      styles.txFilterBtn,
                      {
                        backgroundColor: isActive
                          ? theme.colors.primary
                          : theme.colors.surface1,
                        borderColor: isActive
                          ? theme.colors.primary
                          : theme.colors.glassBorder,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.txFilterText,
                        {
                          color: isActive ? '#FFFFFF' : theme.colors.textSecondary,
                          fontWeight: isActive ? '700' : '500',
                        },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Transactions List */}
            <FlatList
              data={filteredTransactions}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.txListContent}
              renderItem={({ item }) => {
                const isIncome = item.type === 'INCOME';
                const isCommission = item.type === 'POS_COMMISSION';

                return (
                  <View
                    style={[
                      styles.txRow,
                      {
                        backgroundColor: theme.colors.surface1,
                        borderColor: theme.colors.glassBorder,
                      },
                    ]}
                  >
                    <View style={styles.txLeftCol}>
                      <View
                        style={[
                          styles.txIconBg,
                          {
                            backgroundColor: isIncome
                              ? 'rgba(16, 185, 129, 0.12)'
                              : isCommission
                              ? 'rgba(245, 158, 11, 0.12)'
                              : 'rgba(239, 68, 68, 0.12)',
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            isIncome
                              ? 'arrow-down'
                              : isCommission
                              ? 'receipt'
                              : 'arrow-up'
                          }
                          size={16}
                          color={
                            isIncome
                              ? theme.colors.emeraldNeon
                              : isCommission
                              ? theme.colors.amberPulse
                              : theme.colors.crimsonLaser
                          }
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txDesc, { color: theme.colors.textPrimary }]}>
                          {item.description}
                        </Text>
                        <Text style={[styles.txDate, { color: theme.colors.textMuted }]}>
                          {formatDate(item.date)} · Ref: {item.reference || '-'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.txRightCol}>
                      <TabularText
                        style={[
                          styles.txAmount,
                          {
                            color: isIncome
                              ? theme.colors.emeraldNeon
                              : isCommission
                              ? theme.colors.amberPulse
                              : theme.colors.crimsonLaser,
                          },
                        ]}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(item.amount)}
                      </TabularText>

                      <Text style={[styles.balanceAfterText, { color: theme.colors.textMuted }]}>
                        Bakiye: {formatCurrency(item.balanceAfter)}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyTxBox}>
                  <Ionicons name="swap-vertical-outline" size={40} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyTxTitle, { color: theme.colors.textPrimary }]}>
                    İşlem Bulunamadı
                  </Text>
                  <Text style={[styles.emptyTxDesc, { color: theme.colors.textMuted }]}>
                    Seçilen filtre kriterine uygun hesap hareketi bulunmuyor.
                  </Text>
                </View>
              }
            />
          </View>
        ) : (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="card-outline" size={48} color={theme.colors.textMuted} />
            <Text style={[styles.emptyStateTitle, { color: theme.colors.textPrimary }]}>
              Hesap Seçilmedi
            </Text>
            <Text style={[styles.emptyStateDesc, { color: theme.colors.textMuted }]}>
              Hesap ekstresi ve POS blokajlarını görüntülemek için sol panelden bir banka hesabı
              seçin.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
  },
  leftPane: {
    flex: 0.38,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 14,
    gap: 12,
  },
  paneHeader: {
    gap: 2,
    paddingBottom: 4,
  },
  paneTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  paneSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  accountsList: {
    gap: 10,
    paddingBottom: 16,
  },
  accountCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  accTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bankName: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  accName: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  balanceVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  posPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  posPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  rightPane: {
    flex: 0.62,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  statementContent: {
    flex: 1,
    padding: 16,
    gap: 14,
  },
  statementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statementBank: {
    fontSize: 12,
    fontWeight: '800',
  },
  statementAccName: {
    fontSize: 16,
    fontWeight: '800',
  },
  ibanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  ibanText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerRightCol: {
    alignItems: 'flex-end',
    gap: 8,
  },
  headerBalance: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  txFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  txFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  txFilterText: {
    fontSize: 11,
  },
  txListContent: {
    gap: 8,
    paddingBottom: 24,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  txLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  txIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txDesc: {
    fontSize: 12,
    fontWeight: '700',
  },
  txDate: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  txRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  balanceAfterText: {
    fontSize: 10,
    fontWeight: '500',
  },
  emptyTxBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTxTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyTxDesc: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 240,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptyStateDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
});
