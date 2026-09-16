import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ContactListItem } from '../../services/contact.service';
import { formatCurrency } from '../../lib/utils';
import { Badge } from '../common/Badge';

interface Props {
  supplier: ContactListItem;
  onPress: (supplier: ContactListItem) => void;
  onCreateRequest?: (supplier: ContactListItem) => void;
}

export const SupplierCard: React.FC<Props> = ({
  supplier,
  onPress,
  onCreateRequest,
}) => {
  const { theme } = useTheme();

  const handlePhoneCall = (e: any) => {
    e.stopPropagation();
    if (!supplier.phone) {
      Alert.alert('Telefon Yok', 'Bu tedarikçinin kayıtlı telefon numarası bulunmuyor.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`tel:${supplier.phone}`).catch(() => {
      Alert.alert('Hata', 'Arama başlatılamadı.');
    });
  };

  const handleWhatsApp = (e: any) => {
    e.stopPropagation();
    if (!supplier.phone) {
      Alert.alert('Telefon Yok', 'Bu tedarikçinin kayıtlı telefon numarası bulunmuyor.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const cleanPhone = supplier.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `9${cleanPhone}`
      : `90${cleanPhone}`;

    Linking.openURL(`whatsapp://send?phone=${phoneWithCountry}`).catch(() => {
      Alert.alert('Hata', 'WhatsApp uygulaması açılamadı.');
    });
  };

  const currentBalance = supplier.currentBalance ?? 0;
  const isPayable = currentBalance < 0; // Negative balance in accounting often means we owe money (payable)

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress(supplier);
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
      {/* Top Row: Avatar + Name + Code */}
      <View style={styles.topRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="business" size={20} color="#16a34a" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {supplier.name}
            </Text>
            <View style={styles.codeRow}>
              {supplier.code && (
                <Text style={[styles.code, { color: theme.colors.textMuted }]}>
                  Kod: {supplier.code}
                </Text>
              )}
              {supplier.city && (
                <Text style={[styles.city, { color: theme.colors.textSecondary }]}>
                  • {supplier.city}
                </Text>
              )}
            </View>
          </View>
        </View>

        <Badge
          label="Tedarikçi"
          variant="success"
          size="sm"
        />
      </View>

      {/* Balance and Financials */}
      <View style={[styles.balanceCard, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.balanceCol}>
          <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>
            CARİ BAKİYE
          </Text>
          <Text
            style={[
              styles.balanceValue,
              { color: isPayable ? '#dc2626' : currentBalance > 0 ? '#16a34a' : theme.colors.text },
            ]}
          >
            {formatCurrency(Math.abs(currentBalance))} {isPayable ? '(Borcumuz)' : currentBalance > 0 ? '(Alacağımız)' : ''}
          </Text>
        </View>

        {supplier.phone && (
          <View style={styles.quickContactWrap}>
            <TouchableOpacity
              style={[styles.contactIconBtn, { backgroundColor: '#eff6ff' }]}
              onPress={handlePhoneCall}
              activeOpacity={0.7}
            >
              <Ionicons name="call" size={15} color="#2563eb" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactIconBtn, { backgroundColor: '#ecfdf5' }]}
              onPress={handleWhatsApp}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-whatsapp" size={15} color="#16a34a" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom Actions Row */}
      <View style={styles.bottomRow}>
        <Text style={[styles.detailText, { color: theme.colors.textMuted }]}>
          Tedarikçi 360 detayları için dokunun
        </Text>

        {onCreateRequest && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.colors.primaryMuted }]}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onCreateRequest(supplier);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={14} color={theme.colors.primary} />
            <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>
              Talep Aç
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  code: {
    fontSize: 11,
    fontWeight: '500',
  },
  city: {
    fontSize: 11,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  balanceCol: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  quickContactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  detailText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
