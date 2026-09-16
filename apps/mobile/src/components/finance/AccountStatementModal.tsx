import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Share,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  AccountStatementRow,
  AccountStatementSummary,
  getContactAccountStatement,
} from '../../services/finance.service';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  visible: boolean;
  contactId: string | null;
  contactName?: string;
  contactPhone?: string | null;
  onClose: () => void;
}

type RangeOption = 'THIS_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR' | 'ALL';

export const AccountStatementModal: React.FC<Props> = ({
  visible,
  contactId,
  contactName = 'Müşteri',
  contactPhone,
  onClose,
}) => {
  const { theme } = useTheme();

  const [range, setRange] = useState<RangeOption>('THIS_MONTH');
  const [rows, setRows] = useState<AccountStatementRow[]>([]);
  const [summary, setSummary] = useState<AccountStatementSummary>({
    totalDebit: 0,
    totalCredit: 0,
    calculatedBalance: 0,
    isBalanced: true,
    difference: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const calculateDates = useCallback((): { dateFrom?: string; dateTo?: string } => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (range === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      return { dateFrom: firstDay, dateTo: todayStr };
    }

    if (range === 'LAST_3_MONTHS') {
      const past = new Date();
      past.setDate(past.getDate() - 90);
      return { dateFrom: past.toISOString().split('T')[0], dateTo: todayStr };
    }

    if (range === 'THIS_YEAR') {
      const jan1 = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      return { dateFrom: jan1, dateTo: todayStr };
    }

    return {};
  }, [range]);

  const loadStatement = useCallback(async () => {
    if (!contactId) return;
    setIsLoading(true);
    try {
      const { dateFrom, dateTo } = calculateDates();
      const res = await getContactAccountStatement(contactId, {
        dateFrom,
        dateTo,
        limit: 100,
      });
      setRows(res.rows);
      setSummary(res.summary);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  }, [contactId, calculateDates]);

  useEffect(() => {
    if (visible && contactId) {
      loadStatement();
    }
  }, [visible, contactId, range, loadStatement]);

  if (!contactId) return null;

  const currentBal = summary.calculatedBalance;
  const isReceivable = currentBal > 0;
  const isPayable = currentBal < 0;

  const buildShareText = () => {
    const rowsText = rows
      .slice(0, 10)
      .map(
        (r, i) =>
          `${i + 1}. [${formatDate(r.date)}] ${r.documentNumber || '-'} — ${r.description || 'Hareket'}\n   Borç: ${formatCurrency(r.debit)} | Alacak: ${formatCurrency(r.credit)} | Bakiye: ${formatCurrency(r.balance)}`
      )
      .join('\n');

    return (
      `*AXON ERP — CARİ HESAP EKSTRESİ*\n\n` +
      `*Cari / Müşteri:* ${contactName}\n` +
      `*Tarih:* ${new Date().toLocaleDateString('tr-TR')}\n` +
      `*Toplam Borç:* ${formatCurrency(summary.totalDebit)}\n` +
      `*Toplam Alacak:* ${formatCurrency(summary.totalCredit)}\n` +
      `*GÜNCEL BAKİYE:* ${formatCurrency(Math.abs(currentBal))} ${isReceivable ? '(Alacağımız)' : isPayable ? '(Borcumuz)' : '(Sıfır)'}\n\n` +
      `*SON HAREKETLER:*\n${rowsText || 'Kayıtlı hareket bulunamadı'}\n\n` +
      (rows.length > 10 ? `... ve ${rows.length - 10} hareket daha.\n\n` : '') +
      `Bu cari hesap ekstresi AXON Mobil ERP tarafından üretilmiştir.`
    );
  };

  const handleShareWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const text = buildShareText();
    if (!contactPhone) {
      // Open general share if no phone
      Share.share({ message: text, title: 'Cari Hesap Ekstresi' }).catch(() => {});
      return;
    }

    const cleanPhone = contactPhone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `9${cleanPhone}`
      : `90${cleanPhone}`;

    const url = `whatsapp://send?phone=${phoneWithCountry}&text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      Share.share({ message: text, title: 'Cari Hesap Ekstresi' }).catch(() => {});
    });
  };

  const handleSystemShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const text = buildShareText();
    Share.share({ message: text, title: `Cari Ekstre - ${contactName}` }).catch(() => {});
  };

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
                Cari Hesap Ekstresi
              </Text>
              <Badge label="Resmi Döküm" variant="info" size="sm" />
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {contactName}
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

        {/* Date Range Chips */}
        <View style={styles.rangeRow}>
          {[
            { key: 'THIS_MONTH', label: 'Bu Ay' },
            { key: 'LAST_3_MONTHS', label: 'Son 3 Ay' },
            { key: 'THIS_YEAR', label: 'Bu Yıl' },
            { key: 'ALL', label: 'Tüm Zamanlar' },
          ].map((r) => {
            const isSelected = range === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceCard,
                    borderColor: isSelected ? theme.colors.primary : theme.colors.borderSubtle,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setRange(r.key as RangeOption);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.rangeChipText,
                    {
                      color: isSelected ? '#ffffff' : theme.colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Financial Summary Card */}
        <View style={styles.summaryWrap}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.sumCol}>
              <Text style={[styles.sumLabel, { color: theme.colors.textMuted }]}>
                Toplam Borç
              </Text>
              <Text style={[styles.sumVal, { color: theme.colors.text }]}>
                {formatCurrency(summary.totalDebit)}
              </Text>
            </View>

            <View style={styles.sumDivider} />

            <View style={styles.sumCol}>
              <Text style={[styles.sumLabel, { color: theme.colors.textMuted }]}>
                Toplam Alacak
              </Text>
              <Text style={[styles.sumVal, { color: theme.colors.text }]}>
                {formatCurrency(summary.totalCredit)}
              </Text>
            </View>

            <View style={styles.sumDivider} />

            <View style={styles.sumCol}>
              <Text style={[styles.sumLabel, { color: theme.colors.textMuted }]}>
                Net Bakiye
              </Text>
              <Text
                style={[
                  styles.sumVal,
                  {
                    color: isReceivable ? '#10b981' : isPayable ? '#ef4444' : theme.colors.text,
                    fontWeight: '800',
                  },
                ]}
              >
                {formatCurrency(Math.abs(currentBal))}
              </Text>
            </View>
          </View>
        </View>

        {/* Ledger Rows */}
        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
              Ekstre hareketleri hesaplanıyor...
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item, index) => item.id || String(index)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.ledgerCard,
                  {
                    backgroundColor: theme.colors.surfaceCard,
                    borderColor: theme.colors.borderSubtle,
                  },
                ]}
              >
                <View style={styles.ledgerTopRow}>
                  <Text style={[styles.ledgerDate, { color: theme.colors.textMuted }]}>
                    {formatDate(item.date)}
                  </Text>
                  {item.documentNumber && (
                    <Text style={[styles.ledgerDocNo, { color: theme.colors.primary }]}>
                      {item.documentNumber}
                    </Text>
                  )}
                </View>

                <Text style={[styles.ledgerDesc, { color: theme.colors.text }]} numberOfLines={2}>
                  {item.description || 'Cari Hareket'}
                </Text>

                <View style={styles.ledgerAmountsRow}>
                  <View style={styles.ledgerAmountCol}>
                    <Text style={[styles.ledgerAmountLabel, { color: theme.colors.textMuted }]}>
                      Borç:
                    </Text>
                    <Text style={[styles.ledgerAmountVal, { color: item.debit > 0 ? '#ef4444' : theme.colors.textMuted }]}>
                      {item.debit > 0 ? formatCurrency(item.debit) : '-'}
                    </Text>
                  </View>

                  <View style={styles.ledgerAmountCol}>
                    <Text style={[styles.ledgerAmountLabel, { color: theme.colors.textMuted }]}>
                      Alacak:
                    </Text>
                    <Text style={[styles.ledgerAmountVal, { color: item.credit > 0 ? '#10b981' : theme.colors.textMuted }]}>
                      {item.credit > 0 ? formatCurrency(item.credit) : '-'}
                    </Text>
                  </View>

                  <View style={styles.ledgerAmountCol}>
                    <Text style={[styles.ledgerAmountLabel, { color: theme.colors.textMuted }]}>
                      Bakiye:
                    </Text>
                    <Text style={[styles.ledgerAmountVal, { color: theme.colors.text, fontWeight: '700' }]}>
                      {formatCurrency(item.balance)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={44} color={theme.colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                  Kayıtlı Hareket Yok
                </Text>
                <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
                  Seçilen tarih aralığında herhangi bir cari borç/alacak hareketi bulunamadı.
                </Text>
              </View>
            }
          />
        )}

        {/* Footer Share Actions */}
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
            style={[styles.shareBtn, { backgroundColor: '#ecfdf5', borderColor: '#10b981' }]}
            onPress={handleShareWhatsApp}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#059669" />
            <Text style={[styles.shareBtnText, { color: '#059669' }]}>WhatsApp ile İlet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleSystemShare}
            activeOpacity={0.8}
          >
            <Ionicons name="share-social" size={18} color="#ffffff" />
            <Text style={[styles.shareBtnText, { color: '#ffffff' }]}>Ekstreyi Paylaş</Text>
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
  rangeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  rangeChipText: {
    fontSize: 11,
  },
  summaryWrap: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  sumCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  sumDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#cbd5e1',
  },
  sumLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sumVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  ledgerCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  ledgerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ledgerDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  ledgerDocNo: {
    fontSize: 11,
    fontWeight: '700',
  },
  ledgerDesc: {
    fontSize: 12,
    fontWeight: '600',
  },
  ledgerAmountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    marginTop: 2,
  },
  ledgerAmountCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ledgerAmountLabel: {
    fontSize: 10,
  },
  ledgerAmountVal: {
    fontSize: 11,
    fontWeight: '600',
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
    paddingHorizontal: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
