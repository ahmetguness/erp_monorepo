// apps/mobile/src/features/finance/components/PreciousPaperCard.tsx

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { CheckPromissoryNote, CheckStatus } from '../../../services/finance.service';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { formatCurrency, formatDate } from '../../../lib/utils';

export interface PreciousPaperCardProps {
  item: CheckPromissoryNote;
  onPress?: (item: CheckPromissoryNote) => void;
  onEndorse?: (item: CheckPromissoryNote) => void;
  onCollect?: (item: CheckPromissoryNote) => void;
  onBounce?: (item: CheckPromissoryNote) => void;
}

export const PreciousPaperCard: React.FC<PreciousPaperCardProps> = ({
  item,
  onPress,
  onEndorse,
  onCollect,
  onBounce,
}) => {
  const { theme } = useTheme();

  // Days remaining calculation
  const daysRemaining = useMemo(() => {
    if (!item.dueDate) return null;
    const dueTime = new Date(item.dueDate).getTime();
    const nowTime = Date.now();
    const diff = Math.ceil((dueTime - nowTime) / (1000 * 60 * 60 * 24));
    return diff;
  }, [item.dueDate]);

  // Amber pulse check for <= 3 days remaining and not yet cleared/bounced
  const isPending = item.status === 'PENDING' || item.status === 'DEPOSITED';
  const isDueSoon = isPending && daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 3;
  const isOverdue = isPending && daysRemaining !== null && daysRemaining < 0;

  const getStatusStamp = (status: CheckStatus) => {
    switch (status) {
      case 'PENDING':
        return { label: 'PORTFÖYDE', color: theme.colors.primary, icon: 'shield-checkmark-outline' };
      case 'DEPOSITED':
        return { label: 'TAHSİLDE', color: theme.colors.cyanSignal, icon: 'business-outline' };
      case 'CLEARED':
        return { label: 'TAHSİL EDİLDİ', color: theme.colors.emeraldNeon, icon: 'checkmark-done-circle' };
      case 'BOUNCED':
        return { label: 'KARŞILIKSIZ', color: theme.colors.crimsonLaser, icon: 'alert-circle' };
      case 'CANCELLED':
        return { label: 'İPTAL EDİLDİ', color: theme.colors.textMuted, icon: 'close-circle' };
      default:
        return { label: status, color: theme.colors.textMuted, icon: 'document-text-outline' };
    }
  };

  const stamp = getStatusStamp(item.status);

  return (
    <SpringPressable
      onPress={() => onPress?.(item)}
      style={[
        styles.guillocheCard,
        {
          backgroundColor: theme.colors.surface0,
          borderColor: isDueSoon
            ? theme.colors.amberPulse
            : isOverdue
            ? theme.colors.crimsonLaser
            : theme.colors.glassBorder,
        },
        isDueSoon && {
          borderWidth: 1.5,
          shadowColor: theme.colors.amberPulse,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
          elevation: 6,
        },
      ]}
    >
      {/* ── Inner Security Guilloche Border ── */}
      <View
        style={[
          styles.innerGuillocheBorder,
          {
            borderColor: isDueSoon
              ? 'rgba(245, 158, 11, 0.4)'
              : 'rgba(255, 255, 255, 0.08)',
          },
        ]}
      >
        {/* Top Header: Evrak Tipi & Vade Sayacı */}
        <View style={styles.cardHeader}>
          <View style={styles.typeBadgeGroup}>
            <View
              style={[
                styles.typePill,
                {
                  backgroundColor:
                    item.type === 'CHECK'
                      ? 'rgba(59, 130, 246, 0.15)'
                      : 'rgba(168, 85, 247, 0.15)',
                  borderColor:
                    item.type === 'CHECK'
                      ? 'rgba(59, 130, 246, 0.4)'
                      : 'rgba(168, 85, 247, 0.4)',
                },
              ]}
            >
              <Ionicons
                name={item.type === 'CHECK' ? 'receipt-outline' : 'document-text-outline'}
                size={12}
                color={item.type === 'CHECK' ? theme.colors.primary : theme.colors.accentViolet}
              />
              <Text
                style={[
                  styles.typePillText,
                  {
                    color: item.type === 'CHECK' ? theme.colors.primary : theme.colors.accentViolet,
                  },
                ]}
              >
                {item.type === 'CHECK' ? 'BANKA ÇEKİ' : 'SENET / BONO'}
              </Text>
            </View>

            {/* Vade Geri Sayım Rozeti */}
            {isPending && daysRemaining !== null && (
              <View
                style={[
                  styles.countdownPill,
                  {
                    backgroundColor: isOverdue
                      ? 'rgba(239, 68, 68, 0.15)'
                      : isDueSoon
                      ? 'rgba(245, 158, 11, 0.15)'
                      : theme.colors.surface2,
                    borderColor: isOverdue
                      ? theme.colors.crimsonLaser
                      : isDueSoon
                      ? theme.colors.amberPulse
                      : theme.colors.glassBorder,
                  },
                ]}
              >
                <Ionicons
                  name={isOverdue ? 'alert-circle' : isDueSoon ? 'time' : 'calendar-outline'}
                  size={12}
                  color={
                    isOverdue
                      ? theme.colors.crimsonLaser
                      : isDueSoon
                      ? theme.colors.amberPulse
                      : theme.colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.countdownText,
                    {
                      color: isOverdue
                        ? theme.colors.crimsonLaser
                        : isDueSoon
                        ? theme.colors.amberPulse
                        : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {isOverdue
                    ? `${Math.abs(daysRemaining)} Gün Gecikti`
                    : daysRemaining === 0
                    ? 'Bugün Vade Günü!'
                    : `Vadeye ${daysRemaining} Gün`}
                </Text>
              </View>
            )}
          </View>

          {/* Security Stamp / Mühür Rozeti */}
          <View
            style={[
              styles.securityStamp,
              {
                borderColor: stamp.color,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
              },
            ]}
          >
            <Ionicons name={stamp.icon as any} size={11} color={stamp.color} />
            <Text style={[styles.securityStampText, { color: stamp.color }]}>
              {stamp.label}
            </Text>
          </View>
        </View>

        {/* Amount & Currency in Banknote Center */}
        <View style={styles.amountCenter}>
          <Text style={[styles.amountLabel, { color: theme.colors.textMuted }]}>
            EVRAK NOMİNAL TUTARI
          </Text>
          <TabularText style={[styles.amountValue, { color: theme.colors.textPrimary }]}>
            {formatCurrency(item.amount, item.currencyCode || 'TRY')}
          </TabularText>
        </View>

        {/* Bank & Issuer Info (Magnetic Ink / Banknote Style) */}
        <View
          style={[
            styles.metaStrip,
            {
              backgroundColor: theme.colors.surface1,
              borderColor: theme.colors.glassBorder,
            },
          ]}
        >
          <View style={styles.metaCol}>
            <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>Muhatap Banka</Text>
            <Text style={[styles.metaValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {item.bankName || 'Banka Belirtilmedi'}
            </Text>
          </View>

          <View style={styles.metaColRight}>
            <Text style={[styles.metaLabel, { color: theme.colors.textMuted }]}>Evrak / Çek No</Text>
            <Text style={[styles.metaCode, { color: theme.colors.primary }]}>
              {item.number}
            </Text>
          </View>
        </View>

        {/* Issuer / Contact & Due Date */}
        <View style={styles.footerRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.issuerLabel, { color: theme.colors.textMuted }]}>
              Keşideci / Cari:
            </Text>
            <Text
              style={[styles.issuerName, { color: theme.colors.textPrimary }]}
              numberOfLines={1}
            >
              {item.contact?.name || 'Müşteri Belirtilmedi'}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.issuerLabel, { color: theme.colors.textMuted }]}>Vade Tarihi:</Text>
            <Text style={[styles.dueDateText, { color: theme.colors.textPrimary }]}>
              {formatDate(item.dueDate)}
            </Text>
          </View>
        </View>

        {/* Quick Actions (if Pending) */}
        {isPending && (onEndorse || onCollect || onBounce) && (
          <View style={styles.actionsRow}>
            {onEndorse && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onEndorse(item);
                }}
                style={[styles.miniActionBtn, { borderColor: theme.colors.glassBorder }]}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-redo-outline" size={13} color={theme.colors.primary} />
                <Text style={[styles.miniActionText, { color: theme.colors.primary }]}>
                  Ciro Et
                </Text>
              </TouchableOpacity>
            )}

            {onBounce && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onBounce(item);
                }}
                style={[styles.miniActionBtn, { borderColor: theme.colors.glassBorder }]}
                activeOpacity={0.7}
              >
                <Ionicons name="alert-circle-outline" size={13} color={theme.colors.crimsonLaser} />
                <Text style={[styles.miniActionText, { color: theme.colors.crimsonLaser }]}>
                  Karşılıksız
                </Text>
              </TouchableOpacity>
            )}

            {onCollect && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onCollect(item);
                }}
                style={[
                  styles.miniActionBtn,
                  styles.collectActionBtn,
                  { backgroundColor: theme.colors.emeraldNeon },
                ]}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-circle-outline" size={13} color="#FFFFFF" />
                <Text style={styles.collectActionText}>Tahsil Et</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SpringPressable>
  );
};

const styles = StyleSheet.create({
  guillocheCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  innerGuillocheBorder: {
    borderWidth: 1,
    borderRadius: 15,
    margin: 3,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  countdownText: {
    fontSize: 10,
    fontWeight: '700',
  },
  securityStamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  securityStampText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  amountCenter: {
    alignItems: 'center',
    paddingVertical: 6,
    gap: 2,
  },
  amountLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  amountValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  metaStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  metaCol: {
    flex: 1,
    gap: 2,
  },
  metaColRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaCode: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  issuerLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  issuerName: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  dueDateText: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  miniActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  miniActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  collectActionBtn: {
    borderWidth: 0,
  },
  collectActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
