import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ContactDetail } from '../../services/contact.service';
import { formatCurrency } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  visible: boolean;
  supplier: ContactDetail | null;
  onClose: () => void;
  onCreateRequest?: (supplier: ContactDetail) => void;
}

export const SupplierDetailModal: React.FC<Props> = ({
  visible,
  supplier,
  onClose,
  onCreateRequest,
}) => {
  const { theme } = useTheme();

  if (!supplier) return null;

  const currentBalance = supplier.financials?.currentBalance ?? 0;
  const isPayable = currentBalance < 0;

  const handlePhoneCall = () => {
    if (!supplier.phone) {
      Alert.alert('Telefon Yok', 'Kayıtlı telefon numarası bulunmuyor.');
      return;
    }
    Linking.openURL(`tel:${supplier.phone}`).catch(() => {});
  };

  const handleWhatsApp = () => {
    if (!supplier.phone) {
      Alert.alert('Telefon Yok', 'Kayıtlı telefon numarası bulunmuyor.');
      return;
    }
    const cleanPhone = supplier.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `9${cleanPhone}`
      : `90${cleanPhone}`;

    Linking.openURL(`whatsapp://send?phone=${phoneWithCountry}`).catch(() => {});
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
          <View style={styles.headerLeft}>
            <View style={[styles.avatar, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="business" size={22} color="#16a34a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                {supplier.name}
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                {supplier.code ? `Kod: ${supplier.code}` : 'Tedarikçi 360'}
              </Text>
            </View>
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
          {/* Financial Summary Card */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Cari Hesap & Bakiye Özeti
              </Text>
            </View>

            <View style={[styles.balanceBanner, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.balanceBannerLabel, { color: theme.colors.textMuted }]}>
                GÜNCEL BAKİYE
              </Text>
              <Text
                style={[
                  styles.balanceBannerVal,
                  { color: isPayable ? '#dc2626' : currentBalance > 0 ? '#16a34a' : theme.colors.text },
                ]}
              >
                {formatCurrency(Math.abs(currentBalance))}
              </Text>
              <Badge
                label={isPayable ? 'Tedarikçiye Borcumuz Var' : currentBalance > 0 ? 'Tedarikçiden Alacaklıyız' : 'Bakiye Sıfır'}
                variant={isPayable ? 'danger' : currentBalance > 0 ? 'success' : 'neutral'}
                size="sm"
              />
            </View>

            <View style={styles.financialGrid}>
              <View style={styles.finCol}>
                <Text style={[styles.finLabel, { color: theme.colors.textMuted }]}>
                  Toplam Borç
                </Text>
                <Text style={[styles.finVal, { color: theme.colors.text }]}>
                  {formatCurrency(supplier.financials?.totalDebit ?? 0)}
                </Text>
              </View>

              <View style={styles.finCol}>
                <Text style={[styles.finLabel, { color: theme.colors.textMuted }]}>
                  Toplam Alacak
                </Text>
                <Text style={[styles.finVal, { color: theme.colors.text }]}>
                  {formatCurrency(supplier.financials?.totalCredit ?? 0)}
                </Text>
              </View>

              <View style={styles.finCol}>
                <Text style={[styles.finLabel, { color: theme.colors.textMuted }]}>
                  Açık Fatura
                </Text>
                <Text style={[styles.finVal, { color: theme.colors.text }]}>
                  {supplier.financials?.openInvoiceCount ?? 0} Adet
                </Text>
              </View>
            </View>
          </View>

          {/* Contact Details Card */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="call-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                İletişim & Fatura Bilgileri
              </Text>
            </View>

            {supplier.phone && (
              <View style={styles.infoRow}>
                <Ionicons name="call" size={15} color={theme.colors.textMuted} />
                <Text style={[styles.infoText, { color: theme.colors.text }]}>
                  {supplier.phone}
                </Text>
                <View style={styles.contactActions}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#eff6ff' }]}
                    onPress={handlePhoneCall}
                  >
                    <Ionicons name="call" size={13} color="#2563eb" />
                    <Text style={styles.smallBtnText}>Ara</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#ecfdf5' }]}
                    onPress={handleWhatsApp}
                  >
                    <Ionicons name="logo-whatsapp" size={13} color="#16a34a" />
                    <Text style={[styles.smallBtnText, { color: '#16a34a' }]}>WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {supplier.email && (
              <View style={styles.infoRow}>
                <Ionicons name="mail" size={15} color={theme.colors.textMuted} />
                <Text style={[styles.infoText, { color: theme.colors.text }]}>
                  {supplier.email}
                </Text>
              </View>
            )}

            {supplier.address && (
              <View style={styles.infoRow}>
                <Ionicons name="location" size={15} color={theme.colors.textMuted} />
                <Text style={[styles.infoText, { color: theme.colors.text }]}>
                  {supplier.address} {supplier.city ? `(${supplier.city})` : ''}
                </Text>
              </View>
            )}

            {(supplier.taxOffice || supplier.taxNumber) && (
              <View style={styles.infoRow}>
                <Ionicons name="document-text" size={15} color={theme.colors.textMuted} />
                <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
                  Vergi Dairesi: {supplier.taxOffice || '-'} • VKN: {supplier.taxNumber || '-'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer Actions */}
        {onCreateRequest && (
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
              style={[styles.createReqBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onClose();
                onCreateRequest(supplier);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={18} color="#ffffff" />
              <Text style={styles.createReqBtnText}>
                Bu Tedarikçiye Talep / Sipariş Aç
              </Text>
            </TouchableOpacity>
          </View>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  balanceBanner: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  balanceBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceBannerVal: {
    fontSize: 20,
    fontWeight: '800',
  },
  financialGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  finCol: {
    flex: 1,
    alignItems: 'center',
  },
  finLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  finVal: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  infoText: {
    fontSize: 13,
    flex: 1,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  createReqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  createReqBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
