import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ContactDetail } from '../../services/contact.service';
import { Badge } from '../common/Badge';
import { formatCurrency, formatDate } from '../../lib/utils';
import { AccountStatementModal } from '../finance/AccountStatementModal';

export interface Contact360ModalProps {
  visible: boolean;
  contact: ContactDetail | null;
  onClose: () => void;
  onStartOrder: (contact: ContactDetail) => void;
  onStartVisit?: (contact: ContactDetail) => void;
}

export const Contact360Modal: React.FC<Contact360ModalProps> = ({
  visible,
  contact,
  onClose,
  onStartOrder,
  onStartVisit,
}) => {
  const { theme } = useTheme();

  if (!contact) return null;

  const [isStatementModalVisible, setIsStatementModalVisible] = useState(false);
  const currentBalance = contact.financials?.currentBalance ?? 0;
  const isReceivable = currentBalance > 0;
  const isPayable = currentBalance < 0;
  const creditLimit = Number(contact.creditLimit ?? 0);
  const riskRatio = contact.financials?.riskRatio ?? 0;
  const overdueCount = contact.financials?.overdueInvoiceCount ?? 0;

  const handleCall = () => {
    if (!contact.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`tel:${contact.phone}`).catch(() => {});
  };

  const handleWhatsApp = () => {
    if (!contact.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const cleanPhone = contact.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `90${cleanPhone.substring(1)}`
      : `90${cleanPhone}`;
    Linking.openURL(`https://wa.me/${phoneWithCountry}`).catch(() => {});
  };

  const handleNavigate = () => {
    if (!contact.address) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const query = encodeURIComponent(`${contact.address} ${contact.city || ''}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {});
  };

  const handleEmail = () => {
    if (!contact.email) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`mailto:${contact.email}`).catch(() => {});
  };

  const handleStartOrderPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClose();
    onStartOrder(contact);
  };

  const riskBadgeVariant =
    contact.financials?.riskLevel === 'exceeded'
      ? 'danger'
      : contact.financials?.riskLevel === 'warning'
      ? 'warning'
      : contact.financials?.riskLevel === 'safe'
      ? 'success'
      : 'neutral';

  const riskLabel =
    contact.financials?.riskLevel === 'exceeded'
      ? 'RİSK LİMİTİ AŞILDI'
      : contact.financials?.riskLevel === 'warning'
      ? 'YÜKSEK RİSK'
      : contact.financials?.riskLevel === 'safe'
      ? 'GÜVENLİ MÜŞTERİ'
      : 'RİSK TANIMSIZ';

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
        {/* Header Bar */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderBottomColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: theme.colors.primaryMuted },
              ]}
            >
              <Ionicons
                name={contact.type === 'SUPPLIER' ? 'business' : 'person'}
                size={20}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.headerTitles}>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {contact.name}
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {contact.code ? `Kod: ${contact.code} • ` : ''}
                {contact.type === 'CUSTOMER'
                  ? 'Müşteri'
                  : contact.type === 'SUPPLIER'
                  ? 'Tedarikçi'
                  : 'Müşteri & Tedarikçi'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Quick Communication Action Strip */}
          <View style={styles.commStrip}>
            <TouchableOpacity
              style={[
                styles.commBtn,
                { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
                !contact.phone && { opacity: 0.4 },
              ]}
              disabled={!contact.phone}
              onPress={handleCall}
              activeOpacity={0.7}
            >
              <View style={[styles.commIconBadge, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="call" size={18} color="#2563eb" />
              </View>
              <Text style={[styles.commBtnText, { color: theme.colors.text }]}>Ara</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.commBtn,
                { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
                !contact.phone && { opacity: 0.4 },
              ]}
              disabled={!contact.phone}
              onPress={handleWhatsApp}
              activeOpacity={0.7}
            >
              <View style={[styles.commIconBadge, { backgroundColor: '#ecfdf5' }]}>
                <Ionicons name="logo-whatsapp" size={18} color="#10b981" />
              </View>
              <Text style={[styles.commBtnText, { color: theme.colors.text }]}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.commBtn,
                { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
                !contact.address && { opacity: 0.4 },
              ]}
              disabled={!contact.address}
              onPress={handleNavigate}
              activeOpacity={0.7}
            >
              <View style={[styles.commIconBadge, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="navigate" size={18} color="#f59e0b" />
              </View>
              <Text style={[styles.commBtnText, { color: theme.colors.text }]}>Harita</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.commBtn,
                { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
                !contact.email && { opacity: 0.4 },
              ]}
              disabled={!contact.email}
              onPress={handleEmail}
              activeOpacity={0.7}
            >
              <View style={[styles.commIconBadge, { backgroundColor: '#f5f3ff' }]}>
                <Ionicons name="mail" size={18} color="#8b5cf6" />
              </View>
              <Text style={[styles.commBtnText, { color: theme.colors.text }]}>E-Posta</Text>
            </TouchableOpacity>
          </View>

          {/* Financial Summary 360 Card */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                Cari Finans & Risk Durumu
              </Text>
              <Badge label={riskLabel} variant={riskBadgeVariant} size="sm" />
            </View>

            {/* Balance Highlight Box */}
            <View
              style={[
                styles.balanceHighlight,
                {
                  backgroundColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <View>
                <Text style={[styles.balanceSub, { color: theme.colors.textMuted }]}>
                  GÜNCEL NET BAKİYE
                </Text>
                <Text
                  style={[
                    styles.balanceMain,
                    {
                      color: isReceivable
                        ? theme.colors.danger
                        : isPayable
                        ? theme.colors.success
                        : theme.colors.text,
                    },
                  ]}
                >
                  {formatCurrency(Math.abs(currentBalance))}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textMuted }}>
                    {isReceivable ? ' (Borçlu)' : isPayable ? ' (Alacaklı)' : ' (Sıfır)'}
                  </Text>
                </Text>
              </View>

              {overdueCount > 0 && (
                <View style={styles.overdueBadge}>
                  <Ionicons name="alert-circle" size={14} color="#ffffff" />
                  <Text style={styles.overdueText}>{overdueCount} Gecikmiş Fatura</Text>
                </View>
              )}
            </View>

            {/* Credit Limit Progress Bar */}
            {creditLimit > 0 && (
              <View style={styles.creditLimitWrapper}>
                <View style={styles.creditLimitLabels}>
                  <Text style={[styles.creditLimitLabel, { color: theme.colors.textMuted }]}>
                    Risk Limiti Kullanımı ({Math.round(riskRatio)}%)
                  </Text>
                  <Text style={[styles.creditLimitValue, { color: theme.colors.text }]}>
                    {formatCurrency(currentBalance > 0 ? currentBalance : 0)} / {formatCurrency(creditLimit)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.progressBarTrack,
                    { backgroundColor: theme.colors.borderSubtle },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(0, riskRatio))}%`,
                        backgroundColor:
                          riskRatio >= 100
                            ? theme.colors.danger
                            : riskRatio >= 80
                            ? theme.colors.warning
                            : theme.colors.success,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Sub Stats Row */}
            <View style={styles.subStatsRow}>
              <View style={styles.subStatCol}>
                <Text style={[styles.subStatVal, { color: theme.colors.text }]}>
                  {formatCurrency(contact.financials?.totalDebit ?? 0)}
                </Text>
                <Text style={[styles.subStatLbl, { color: theme.colors.textMuted }]}>Toplam Borç</Text>
              </View>
              <View style={[styles.subStatDivider, { backgroundColor: theme.colors.borderSubtle }]} />
              <View style={styles.subStatCol}>
                <Text style={[styles.subStatVal, { color: theme.colors.text }]}>
                  {formatCurrency(contact.financials?.totalCredit ?? 0)}
                </Text>
                <Text style={[styles.subStatLbl, { color: theme.colors.textMuted }]}>Toplam Alacak</Text>
              </View>
              <View style={[styles.subStatDivider, { backgroundColor: theme.colors.borderSubtle }]} />
              <View style={styles.subStatCol}>
                <Text style={[styles.subStatVal, { color: theme.colors.text }]}>
                  {contact.financials?.openInvoiceCount ?? 0}
                </Text>
                <Text style={[styles.subStatLbl, { color: theme.colors.textMuted }]}>Açık Fatura</Text>
              </View>
            </View>

            {/* FAZ 14.4: Cari Hesap Ekstresi (PDF / Paylaş) */}
            <TouchableOpacity
              style={[
                styles.statementBtn,
                {
                  backgroundColor: theme.colors.primary + '12',
                  borderColor: theme.colors.primary + '35',
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setIsStatementModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.statementBtnLeft}>
                <Ionicons name="receipt-outline" size={17} color={theme.colors.primary} />
                <Text style={[styles.statementBtnText, { color: theme.colors.primary }]}>
                  Cari Hesap Ekstresi (PDF / Paylaş)
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Contact Details Card */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>İletişim & Fatura Bilgileri</Text>

            {Boolean(contact.phone) && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Telefon</Text>
                <Text style={[styles.detailVal, { color: theme.colors.text }]}>{contact.phone}</Text>
              </View>
            )}

            {Boolean(contact.email) && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>E-Posta</Text>
                <Text style={[styles.detailVal, { color: theme.colors.text }]}>{contact.email}</Text>
              </View>
            )}

            {Boolean(contact.address) && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Adres</Text>
                <Text style={[styles.detailVal, { color: theme.colors.textSecondary, flex: 1, textAlign: 'right' }]}>
                  {contact.address} {contact.city ? `(${contact.city})` : ''}
                </Text>
              </View>
            )}

            {Boolean(contact.taxNumber) && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Vergi No / Dairesi</Text>
                <Text style={[styles.detailVal, { color: theme.colors.text }]}>
                  {contact.taxNumber} {contact.taxOffice ? `• ${contact.taxOffice}` : ''}
                </Text>
              </View>
            )}

            {contact.paymentTermDays !== undefined && contact.paymentTermDays !== null && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailKey, { color: theme.colors.textMuted }]}>Ödeme Vadesi</Text>
                <Text style={[styles.detailVal, { color: theme.colors.text }]}>
                  {contact.paymentTermDays} Gün
                </Text>
              </View>
            )}
          </View>

          {/* Open Invoices List */}
          {Boolean(contact.openInvoices && contact.openInvoices.length > 0) && (
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                  ...theme.shadows.sm,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                Açık Faturalar ({contact.openInvoices?.length})
              </Text>

              {contact.openInvoices?.map((inv) => (
                <View
                  key={inv.id}
                  style={[
                    styles.invoiceRow,
                    { borderBottomColor: theme.colors.borderSubtle },
                  ]}
                >
                  <View style={styles.invLeft}>
                    <Text style={[styles.invNum, { color: theme.colors.text }]}>{inv.number}</Text>
                    <Text style={[styles.invDate, { color: theme.colors.textMuted }]}>
                      Tarih: {formatDate(inv.date)} {inv.dueDate ? `• Vade: ${formatDate(inv.dueDate)}` : ''}
                    </Text>
                  </View>

                  <View style={styles.invRight}>
                    <Text style={[styles.invAmount, { color: theme.colors.text }]}>
                      {formatCurrency(inv.totalGross)}
                    </Text>
                    {inv.isOverdue ? (
                      <Badge label="GECİKMİŞ" variant="danger" size="sm" />
                    ) : (
                      <Badge label="VADESİ GELMEMİŞ" variant="neutral" size="sm" />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Bottom CTA Sticky Bar */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
              ...theme.shadows.md,
            },
          ]}
        >
          {onStartVisit && (
            <TouchableOpacity
              style={styles.startVisitBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onClose();
                onStartVisit(contact);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="location" size={17} color="#22c55e" />
              <Text style={styles.startVisitBtnText}>Ziyaret</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.startOrderBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleStartOrderPress}
            activeOpacity={0.8}
          >
            <Ionicons name="cart" size={18} color="#ffffff" />
            <Text style={styles.startOrderBtnText}>Sipariş Başlat</Text>
          </TouchableOpacity>
        </View>

        {/* FAZ 14.4: Cari Hesap Ekstresi Modal */}
        <AccountStatementModal
          visible={isStatementModalVisible}
          contactId={contact.id}
          contactName={contact.name}
          onClose={() => setIsStatementModalVisible(false)}
        />
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 90,
  },
  commStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  commBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  commIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  balanceHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  balanceSub: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceMain: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  overdueText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  creditLimitWrapper: {
    gap: 6,
  },
  creditLimitLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creditLimitLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  creditLimitValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  subStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 4,
  },
  subStatCol: {
    alignItems: 'center',
    flex: 1,
  },
  subStatVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  subStatLbl: {
    fontSize: 10,
    marginTop: 2,
  },
  subStatDivider: {
    width: 1,
    height: 24,
  },
  statementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  statementBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statementBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailKey: {
    fontSize: 12,
  },
  detailVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  invLeft: {
    flex: 1,
    marginRight: 10,
  },
  invNum: {
    fontSize: 13,
    fontWeight: '700',
  },
  invDate: {
    fontSize: 10,
    marginTop: 2,
  },
  invRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  invAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startVisitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#22c55e',
    backgroundColor: '#0f172a',
  },
  startVisitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  startOrderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  startOrderBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
