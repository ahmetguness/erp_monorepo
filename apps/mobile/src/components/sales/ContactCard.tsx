import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ContactListItem } from '../../services/contact.service';
import { Badge } from '../common/Badge';
import { formatCurrency } from '../../lib/utils';

export interface ContactCardProps {
  contact: ContactListItem;
  onPress: (contact: ContactListItem) => void;
  onStartOrder?: (contact: ContactListItem) => void;
}

export const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  onPress,
  onStartOrder,
}) => {
  const { theme } = useTheme();

  const handleCall = (e: any) => {
    e.stopPropagation?.();
    if (!contact.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`tel:${contact.phone}`).catch(() => {});
  };

  const handleWhatsApp = (e: any) => {
    e.stopPropagation?.();
    if (!contact.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Clean phone number
    const cleanPhone = contact.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `90${cleanPhone.substring(1)}`
      : `90${cleanPhone}`;
    Linking.openURL(`https://wa.me/${phoneWithCountry}`).catch(() => {});
  };

  const isReceivable = (contact.currentBalance ?? 0) > 0;
  const isPayable = (contact.currentBalance ?? 0) < 0;

  const riskBadgeVariant =
    contact.riskLevel === 'exceeded'
      ? 'danger'
      : contact.riskLevel === 'warning'
      ? 'warning'
      : contact.riskLevel === 'safe'
      ? 'success'
      : 'neutral';

  const riskLabel =
    contact.riskLevel === 'exceeded'
      ? 'RİSK LİMİTİ AŞILDI'
      : contact.riskLevel === 'warning'
      ? 'YÜKSEK RİSK'
      : contact.riskLevel === 'safe'
      ? 'RİSK GÜVENLİ'
      : contact.type === 'CUSTOMER'
      ? 'MÜŞTERİ'
      : contact.type === 'SUPPLIER'
      ? 'TEDARİKÇİ'
      : 'MÜŞTERİ / TEDARİKÇİ';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceCard,
          borderColor: theme.colors.borderSubtle,
          borderRadius: theme.borderRadius.lg,
          ...theme.shadows.sm,
        },
      ]}
      activeOpacity={0.7}
      onPress={() => onPress(contact)}
    >
      {/* Top Header Row */}
      <View style={styles.topRow}>
        <View style={styles.avatarWrapper}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: theme.colors.primaryMuted },
            ]}
          >
            <Ionicons
              name={contact.type === 'SUPPLIER' ? 'business' : 'person'}
              size={18}
              color={theme.colors.primary}
            />
          </View>
          <View style={styles.headerTitles}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {contact.name}
            </Text>
            <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
              {contact.code ? `${contact.code} • ` : ''}
              {contact.city || 'Şehir Belirtilmedi'}
            </Text>
          </View>
        </View>

        <Badge label={riskLabel} variant={riskBadgeVariant} size="sm" />
      </View>

      {/* Financial & Balance Details */}
      <View
        style={[
          styles.balanceContainer,
          {
            backgroundColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.md,
          },
        ]}
      >
        <View style={styles.balanceCol}>
          <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>
            CARİ BAKİYE
          </Text>
          <Text
            style={[
              styles.balanceValue,
              {
                color: isReceivable
                  ? theme.colors.danger
                  : isPayable
                  ? theme.colors.success
                  : theme.colors.text,
              },
            ]}
          >
            {formatCurrency(Math.abs(contact.currentBalance ?? 0))}
            <Text style={[styles.balanceDirection, { color: theme.colors.textMuted }]}>
              {isReceivable ? ' (Borçlu)' : isPayable ? ' (Alacaklı)' : ' (Kapalı)'}
            </Text>
          </Text>
        </View>

        {contact.creditLimit !== undefined && contact.creditLimit !== null && contact.creditLimit > 0 && (
          <View style={styles.limitCol}>
            <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>
              KREDİ LİMİTİ
            </Text>
            <Text style={[styles.limitValue, { color: theme.colors.textSecondary }]}>
              {formatCurrency(contact.creditLimit)}
            </Text>
          </View>
        )}
      </View>

      {/* Footer Quick Action Buttons */}
      <View style={styles.footerRow}>
        <View style={styles.contactActions}>
          {Boolean(contact.phone) && (
            <>
              <TouchableOpacity
                style={[styles.actionIconBtn, { backgroundColor: theme.colors.borderSubtle }]}
                onPress={handleCall}
                activeOpacity={0.7}
              >
                <Ionicons name="call-outline" size={16} color={theme.colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionIconBtn, { backgroundColor: '#ecfdf5' }]}
                onPress={handleWhatsApp}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#10b981" />
              </TouchableOpacity>
            </>
          )}

          {Boolean(contact.address) && (
            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: theme.colors.borderSubtle }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    contact.address || ''
                  )}`
                ).catch(() => {});
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="navigate-outline" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {onStartOrder && (
          <TouchableOpacity
            style={[styles.orderBtn, { backgroundColor: theme.colors.primary }]}
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onStartOrder(contact);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={14} color="#ffffff" />
            <Text style={styles.orderBtnText}>Sipariş Başlat</Text>
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
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  avatarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 6,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  metaText: {
    fontSize: 11,
    marginTop: 2,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  balanceCol: {
    flex: 1,
  },
  limitCol: {
    alignItems: 'flex-end',
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
  balanceDirection: {
    fontSize: 11,
    fontWeight: '500',
  },
  limitValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  orderBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
