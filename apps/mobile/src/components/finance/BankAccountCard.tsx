import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { BankAccount, CashAccount } from '../../services/finance.service';
import { formatCurrency } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  account: BankAccount | CashAccount;
  isCash?: boolean;
  onPress: (account: BankAccount | CashAccount, isCash: boolean) => void;
}

export const BankAccountCard: React.FC<Props> = ({
  account,
  isCash = false,
  onPress,
}) => {
  const { theme } = useTheme();
  const bankAccount = !isCash ? (account as BankAccount) : null;
  const balance = Number((account as any)?.balance ?? 0);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress(account, isCash);
      }}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.borderSubtle,
          borderRadius: theme.borderRadius.lg,
          ...theme.shadows.sm,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.leftCol}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: isCash ? '#ecfdf5' : '#eff6ff' },
            ]}
          >
            <Ionicons
              name={isCash ? 'cash' : 'business'}
              size={18}
              color={isCash ? '#059669' : '#2563eb'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.accountName, { color: theme.colors.text }]} numberOfLines={1}>
              {account.name}
            </Text>
            {bankAccount?.bankName && (
              <Text style={[styles.bankName, { color: theme.colors.textMuted }]}>
                {bankAccount.bankName} {bankAccount.branchName ? `• ${bankAccount.branchName}` : ''}
              </Text>
            )}
          </View>
        </View>

        <Badge
          label={isCash ? 'KASA' : bankAccount?.currencyCode || 'TRY'}
          variant={isCash ? 'success' : 'info'}
          size="sm"
        />
      </View>

      {bankAccount?.iban && (
        <View style={styles.ibanRow}>
          <Text style={[styles.ibanLabel, { color: theme.colors.textMuted }]}>IBAN:</Text>
          <Text style={[styles.ibanValue, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {bankAccount.iban}
          </Text>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>
            GÜNCEL BAKİYE
          </Text>
          <Text
            style={[
              styles.balanceValue,
              { color: balance >= 0 ? '#10b981' : '#ef4444' },
            ]}
          >
            {formatCurrency(balance, bankAccount?.currencyCode || 'TRY')}
          </Text>
        </View>

        <View style={styles.actionWrap}>
          <Text style={[styles.actionText, { color: theme.colors.primary }]}>
            Hareketler
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    fontSize: 14,
    fontWeight: '700',
  },
  bankName: {
    fontSize: 11,
    marginTop: 1,
  },
  ibanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ibanLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  ibanValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 1,
  },
  actionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
