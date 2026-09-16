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
import { FieldServiceJob, ServiceStatus } from '../../services/field-service.service';
import { Badge } from '../common/Badge';

export interface ServiceJobCardProps {
  job: FieldServiceJob;
  onPress: (job: FieldServiceJob) => void;
  onChangeStatus: (job: FieldServiceJob) => void;
  onAddParts: (job: FieldServiceJob) => void;
  onCaptureSignature: (job: FieldServiceJob) => void;
  onSubmitReport: (job: FieldServiceJob) => void;
  onViewReportPdf?: (job: FieldServiceJob) => void;
}

export const ServiceJobCard: React.FC<ServiceJobCardProps> = ({
  job,
  onPress,
  onChangeStatus,
  onAddParts,
  onCaptureSignature,
  onSubmitReport,
  onViewReportPdf,
}) => {
  const { theme } = useTheme();

  const handleCall = (e: any) => {
    e.stopPropagation?.();
    const phone = job.contact?.phone || job.routeStop.contactPhone;
    if (!phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const handleWhatsApp = (e: any) => {
    e.stopPropagation?.();
    const phone = job.contact?.phone || job.routeStop.contactPhone;
    if (!phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('90')
      ? cleanPhone
      : cleanPhone.startsWith('0')
      ? `90${cleanPhone.substring(1)}`
      : `90${cleanPhone}`;
    Linking.openURL(`https://wa.me/${phoneWithCountry}`).catch(() => {});
  };

  const handleNavigate = (e: any) => {
    e.stopPropagation?.();
    const addr = job.contact?.address || job.routeStop.address;
    const city = job.contact?.city || job.routeStop.city || '';
    if (!addr && !city) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const query = encodeURIComponent(`${addr || ''} ${city}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {});
  };

  // Status mapping
  const getStatusInfo = (status: ServiceStatus) => {
    switch (status) {
      case 'OPEN':
        return { label: 'AÇIK TALEP', variant: 'neutral' as const };
      case 'IN_PROGRESS':
        return { label: 'MÜDAHALE BAŞLADI', variant: 'info' as const };
      case 'WAITING_PARTS':
        return { label: 'PARÇA BEKLİYOR', variant: 'warning' as const };
      case 'WAITING_CUSTOMER':
        return { label: 'MÜŞTERİ BEKLİYOR', variant: 'warning' as const };
      case 'COMPLETED':
        return { label: 'TAMAMLANDI', variant: 'success' as const };
      case 'CANCELLED':
        return { label: 'İPTAL EDİLDİ', variant: 'danger' as const };
      default:
        return { label: status, variant: 'neutral' as const };
    }
  };

  // Priority mapping
  const getPriorityInfo = (priority: FieldServiceJob['priority']) => {
    switch (priority) {
      case 'CRITICAL':
      case 'URGENT':
        return { label: 'KRİTİK', variant: 'danger' as const };
      case 'HIGH':
        return { label: 'YÜKSEK', variant: 'warning' as const };
      case 'LOW':
        return { label: 'DÜŞÜK', variant: 'neutral' as const };
      default:
        return { label: 'ORTA', variant: 'info' as const };
    }
  };

  const statusInfo = getStatusInfo(job.status);
  const priorityInfo = getPriorityInfo(job.priority);
  const contactPhone = job.contact?.phone || job.routeStop.contactPhone;
  const addressText = [job.contact?.address || job.routeStop.address, job.contact?.city || job.routeStop.city]
    .filter(Boolean)
    .join(' / ');

  const completedSteps = job.steps.filter((s) => s.status === 'complete').length;
  const totalSteps = job.steps.length || 6;
  const progressPct = Math.round((completedSteps / totalSteps) * 100);

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
      activeOpacity={0.8}
      onPress={() => onPress(job)}
    >
      {/* Top Header Row */}
      <View style={styles.topRow}>
        <View style={styles.ticketBadge}>
          <Text style={[styles.ticketNum, { color: theme.colors.primary }]}>
            {job.number}
          </Text>
        </View>

        <View style={styles.badgesRow}>
          <Badge label={priorityInfo.label} variant={priorityInfo.variant} size="sm" />
          <Badge label={statusInfo.label} variant={statusInfo.variant} size="sm" />
        </View>
      </View>

      {/* Subject Title */}
      <Text style={[styles.subject, { color: theme.colors.text }]} numberOfLines={2}>
        {job.subject}
      </Text>

      {/* Customer and Asset Info Box */}
      <View
        style={[
          styles.infoBox,
          {
            backgroundColor: theme.colors.borderSubtle,
            borderRadius: theme.borderRadius.md,
          },
        ]}
      >
        {/* Customer */}
        <View style={styles.infoRow}>
          <Ionicons name="business-outline" size={14} color={theme.colors.primary} />
          <Text style={[styles.infoMainText, { color: theme.colors.text }]} numberOfLines={1}>
            {job.contact?.name || 'Müşteri Belirtilmedi'}
          </Text>
        </View>

        {/* Device Asset Info if available */}
        {Boolean(job.asset) && (
          <View style={styles.infoRow}>
            <Ionicons name="hardware-chip-outline" size={14} color={theme.colors.textMuted} />
            <Text style={[styles.infoSubText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {job.asset?.name} {job.asset?.brand ? `(${job.asset.brand}` : ''}
              {job.asset?.model ? ` ${job.asset.model})` : job.asset?.brand ? ')' : ''}
              {job.asset?.serialNo ? ` • Seri: ${job.asset.serialNo}` : ''}
            </Text>
          </View>
        )}

        {/* Address */}
        {Boolean(addressText) && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={theme.colors.textMuted} />
            <Text style={[styles.infoSubText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {addressText}
            </Text>
          </View>
        )}
      </View>

      {/* Steps Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>
            Saha İlerlemesi ({completedSteps}/{totalSteps} Adım)
          </Text>
          <Text style={[styles.progressPercent, { color: theme.colors.primary }]}>
            %{progressPct}
          </Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: theme.colors.borderSubtle }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPct}%`,
                backgroundColor:
                  progressPct === 100
                    ? theme.colors.success
                    : progressPct >= 50
                    ? theme.colors.primary
                    : theme.colors.warning,
              },
            ]}
          />
        </View>

        {/* Micro step indicators row */}
        <View style={styles.microStepsRow}>
          {job.steps.map((step) => {
            const isDone = step.status === 'complete';
            return (
              <View
                key={step.key}
                style={[
                  styles.microStepPill,
                  {
                    backgroundColor: isDone ? theme.colors.primaryMuted : theme.colors.borderSubtle,
                  },
                ]}
              >
                <Ionicons
                  name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                  size={10}
                  color={isDone ? theme.colors.primary : theme.colors.textMuted}
                />
                <Text
                  style={[
                    styles.microStepText,
                    { color: isDone ? theme.colors.primary : theme.colors.textMuted },
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Action Footer */}
      <View style={styles.footerRow}>
        {/* Contact shortcuts */}
        <View style={styles.commActions}>
          {Boolean(contactPhone) && (
            <>
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: theme.colors.borderSubtle }]}
                onPress={handleCall}
                activeOpacity={0.7}
              >
                <Ionicons name="call-outline" size={16} color={theme.colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: '#ecfdf5' }]}
                onPress={handleWhatsApp}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#10b981" />
              </TouchableOpacity>
            </>
          )}

          {Boolean(addressText) && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.colors.borderSubtle }]}
              onPress={handleNavigate}
              activeOpacity={0.7}
            >
              <Ionicons name="navigate-outline" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Action Buttons Group */}
        <View style={styles.operationActions}>
          {/* Status Change Button */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onChangeStatus(job);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="sync-outline" size={13} color={theme.colors.text} />
            <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Durum</Text>
          </TouchableOpacity>

          {/* Add Spare Parts Button */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onAddParts(job);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="build-outline" size={13} color={theme.colors.text} />
            <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Parça</Text>
          </TouchableOpacity>

          {/* Signature Button */}
          <TouchableOpacity
            style={[
              styles.actionBtn,
              {
                backgroundColor: job.customerApproved ? '#ecfdf5' : theme.colors.borderSubtle,
              },
            ]}
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onCaptureSignature(job);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="pencil-outline"
              size={13}
              color={job.customerApproved ? '#10b981' : theme.colors.text}
            />
            <Text
              style={[
                styles.actionBtnText,
                { color: job.customerApproved ? '#047857' : theme.colors.text },
              ]}
            >
              İmza
            </Text>
          </TouchableOpacity>

          {/* Service Report Submit / View PDF Button */}
          <TouchableOpacity
            style={[
              styles.actionBtnPrimary,
              {
                backgroundColor: job.serviceFormSubmitted ? '#10b981' : theme.colors.primary,
              },
            ]}
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              if (job.serviceFormSubmitted && onViewReportPdf) {
                onViewReportPdf(job);
              } else {
                onSubmitReport(job);
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={job.serviceFormSubmitted ? 'document-text' : 'document-text-outline'}
              size={13}
              color="#ffffff"
            />
            <Text style={styles.actionBtnPrimaryText}>
              {job.serviceFormSubmitted ? 'PDF Rapor' : 'Raporla'}
            </Text>
          </TouchableOpacity>
        </View>
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
  },
  ticketBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ticketNum: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subject: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  infoBox: {
    padding: 10,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoMainText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  infoSubText: {
    fontSize: 11,
    flex: 1,
  },
  progressContainer: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressPercent: {
    fontSize: 11,
    fontWeight: '800',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  microStepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingTop: 2,
  },
  microStepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  microStepText: {
    fontSize: 9,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    gap: 6,
  },
  commActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  actionBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
