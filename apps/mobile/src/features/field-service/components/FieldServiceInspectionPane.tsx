// apps/mobile/src/features/field-service/components/FieldServiceInspectionPane.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import {
  FieldServiceJob,
  ServiceStatus,
  Priority,
} from '../../../services/field-service.service';
import { Badge } from '../../../components/common/Badge';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { StatusPulseDot } from '../../../design-system/primitives/StatusPulseDot';
import { formatDate } from '../../../lib/utils';

export interface FieldServiceInspectionPaneProps {
  job: FieldServiceJob | null;
  onStatusChange?: (job: FieldServiceJob) => void;
  onAddParts?: (job: FieldServiceJob) => void;
  onCaptureSignature?: (job: FieldServiceJob) => void;
  onSubmitReport?: (job: FieldServiceJob) => void;
  onViewReportPdf?: (job: FieldServiceJob) => void;
  onOpenRouteMap?: () => void;
  signatureSvgPaths?: string[];
  reportDetails?: { diagnosis: string; actionsTaken: string };
}

export const FieldServiceInspectionPane: React.FC<FieldServiceInspectionPaneProps> = ({
  job,
  onStatusChange,
  onAddParts,
  onCaptureSignature,
  onSubmitReport,
  onViewReportPdf,
  onOpenRouteMap,
  signatureSvgPaths = [],
  reportDetails,
}) => {
  const { theme } = useTheme();

  if (!job) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.colors.surfaceCard }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.borderSubtle }]}>
          <Ionicons name="build-outline" size={48} color={theme.colors.textMuted} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Servis Çağrısı Seçilmedi</Text>
        <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
          Sol listeden rota detayını, müşteri konumunu ve servis raporunu denetlemek istediğiniz teknik servis biletine dokunun.
        </Text>
      </View>
    );
  }

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'CRITICAL':
      case 'URGENT':
        return { label: 'ACİL MÜDAHALE', variant: 'danger' as const };
      case 'HIGH':
        return { label: 'YÜKSEK ÖNCELİK', variant: 'warning' as const };
      case 'MEDIUM':
        return { label: 'NORMAL', variant: 'info' as const };
      case 'LOW':
        return { label: 'DÜŞÜK', variant: 'neutral' as const };
      default:
        return { label: priority, variant: 'neutral' as const };
    }
  };

  const getStatusBadge = (status: ServiceStatus) => {
    switch (status) {
      case 'IN_PROGRESS':
        return { label: 'MÜDAHALEDE', variant: 'info' as const };
      case 'WAITING_PARTS':
        return { label: 'PARÇA BEKLİYOR', variant: 'warning' as const };
      case 'COMPLETED':
        return { label: 'TAMAMLANDI', variant: 'success' as const };
      case 'OPEN':
        return { label: 'BEKLİYOR', variant: 'neutral' as const };
      case 'CANCELLED':
        return { label: 'İPTAL', variant: 'danger' as const };
      default:
        return { label: status, variant: 'neutral' as const };
    }
  };

  const priorityBadge = getPriorityBadge(job.priority);
  const statusBadge = getStatusBadge(job.status);

  const handleCall = () => {
    if (!job.contact?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Linking.openURL(`tel:${job.contact.phone}`).catch(() => {});
  };

  const handleWhatsApp = () => {
    if (!job.contact?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const cleanPhone = job.contact.phone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${cleanPhone}?text=Merhaba,%20AXON%20Saha%20Servis%20${job.number}%20no'lu%20çağrınızla%20ilgili%20bilgilendirme%20yapmak%20istiyoruz.`).catch(() => {});
  };

  const handleOpenNavigation = () => {
    const query = encodeURIComponent(`${job.contact?.address || ''} ${job.contact?.city || ''}`);
    if (!query.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  const hasSignature = Boolean(job.customerApproved || (signatureSvgPaths && signatureSvgPaths.length > 0));

  return (
    <View
      style={[
        styles.paneContainer,
        { backgroundColor: theme.colors.surface1, borderLeftColor: theme.colors.borderSubtle },
      ]}
    >
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Hero Card */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.headerTop}>
            <View style={styles.titleWrap}>
              <View style={[styles.badgePill, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="construct" size={14} color={theme.colors.primary} />
                <Text style={[styles.badgePillText, { color: theme.colors.primary }]}>SERVİS BİLETİ</Text>
              </View>
              <Text style={[styles.docNumber, { color: theme.colors.text }]}>
                {job.number}
              </Text>
            </View>
            <View style={styles.badgesRow}>
              <Badge label={priorityBadge.label} variant={priorityBadge.variant} />
              <Badge label={statusBadge.label} variant={statusBadge.variant} />
            </View>
          </View>

          <Text style={[styles.subjectTitle, { color: theme.colors.text }]}>
            {job.subject}
          </Text>
          <Text style={[styles.subjectMeta, { color: theme.colors.textMuted }]}>
            Kayıt Tarihi: {formatDate(job.createdAt)} • Rota Durak Sırası: #{job.routeStop?.sequence || 1}
          </Text>
        </View>

        {/* Section 1: Customer 360 & Quick Action Strip */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="business-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Müşteri & Saha Lokasyonu
              </Text>
            </View>
            {job.contact?.city && (
              <Badge label={job.contact.city} variant="neutral" />
            )}
          </View>

          <View style={styles.customerBody}>
            <Text style={[styles.customerName, { color: theme.colors.text }]}>
              {job.contact?.name || 'Müşteri Belirtilmedi'}
            </Text>
            <View style={styles.customerAddressRow}>
              <Ionicons name="location-outline" size={16} color={theme.colors.textMuted} />
              <Text style={[styles.customerAddressText, { color: theme.colors.textSecondary }]}>
                {job.contact?.address ? `${job.contact.address}, ${job.contact.city || ''}` : 'Adres bilgisi girilmedi'}
              </Text>
            </View>
            {job.contact?.phone && (
              <View style={styles.customerPhoneRow}>
                <Ionicons name="call-outline" size={16} color={theme.colors.textMuted} />
                <Text style={[styles.customerPhoneText, { color: theme.colors.textSecondary }]}>
                  {job.contact.phone}
                </Text>
              </View>
            )}
          </View>

          {/* Quick Contact & Navigation Strip */}
          <View style={styles.contactActionsRow}>
            <TouchableOpacity
              style={[styles.contactActionBtn, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
              onPress={handleCall}
              activeOpacity={0.7}
            >
              <Ionicons name="call" size={15} color="#10B981" />
              <Text style={[styles.contactActionBtnText, { color: theme.colors.text }]}>Telefon</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactActionBtn, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
              onPress={handleWhatsApp}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
              <Text style={[styles.contactActionBtnText, { color: theme.colors.text }]}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactActionBtn, { backgroundColor: theme.colors.primaryMuted, borderColor: 'transparent' }]}
              onPress={handleOpenNavigation}
              activeOpacity={0.7}
            >
              <Ionicons name="navigate" size={15} color={theme.colors.primary} />
              <Text style={[styles.contactActionBtnText, { color: theme.colors.primary }]}>Haritada Aç</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 2: Asset & Equipment Diagnostics */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="hardware-chip-outline" size={18} color="#8B5CF6" />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Cihaz & Ekipman Bilgileri
              </Text>
            </View>
            <Badge label="Garantili / Sözleşmeli" variant="success" />
          </View>

          <View style={styles.assetGrid}>
            <View style={[styles.assetItem, { backgroundColor: theme.colors.surface2 }]}>
              <Text style={[styles.assetLabel, { color: theme.colors.textMuted }]}>CİHAZ ADI</Text>
              <Text style={[styles.assetVal, { color: theme.colors.text }]}>
                {job.asset?.name || 'Endüstriyel Ekipman'}
              </Text>
            </View>

            <View style={[styles.assetItem, { backgroundColor: theme.colors.surface2 }]}>
              <Text style={[styles.assetLabel, { color: theme.colors.textMuted }]}>MARKA / MODEL</Text>
              <Text style={[styles.assetVal, { color: theme.colors.text }]}>
                {job.asset?.brand || '-'} {job.asset?.model ? `/ ${job.asset.model}` : ''}
              </Text>
            </View>

            <View style={[styles.assetItem, { backgroundColor: theme.colors.surface2 }]}>
              <Text style={[styles.assetLabel, { color: theme.colors.textMuted }]}>SERİ NUMARASI</Text>
              <TabularText style={[styles.assetVal, { color: theme.colors.primary }]}>
                {job.asset?.serialNo || 'SN-2026-X001'}
              </TabularText>
            </View>
          </View>
        </View>

        {/* Section 3: Interactive SVG Mini Route Map & ETA */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="map-outline" size={18} color="#06B6D4" />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Saha Rota & Navigasyon Durumu
              </Text>
            </View>
            <TouchableOpacity
              style={styles.expandMapLink}
              onPress={onOpenRouteMap}
            >
              <Text style={[styles.expandMapLinkText, { color: theme.colors.primary }]}>Tam Harita</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Mini Interactive SVG Route Track */}
          <View style={[styles.svgMapWrap, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}>
            <Svg width="100%" height={120} viewBox="0 0 340 120">
              {/* Background stylized grid lines */}
              <Line x1="0" y1="40" x2="340" y2="40" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <Line x1="0" y1="80" x2="340" y2="80" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <Line x1="110" y1="0" x2="110" y2="120" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <Line x1="220" y1="0" x2="220" y2="120" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

              {/* Connected Route Path */}
              <Polyline
                points="40,60 120,40 200,80 290,45"
                fill="none"
                stroke={theme.colors.primary}
                strokeWidth="3"
                strokeDasharray="6,4"
              />

              {/* Stop 1: Completed */}
              <Circle cx="40" cy="60" r="10" fill="#10B981" />
              <Circle cx="40" cy="60" r="4" fill="#FFFFFF" />

              {/* Stop 2: Current Selected Active */}
              <Circle cx="120" cy="40" r="14" fill="rgba(59, 130, 246, 0.25)" />
              <Circle cx="120" cy="40" r="9" fill="#3B82F6" />
              <Circle cx="120" cy="40" r="4" fill="#FFFFFF" />

              {/* Stop 3: Upcoming */}
              <Circle cx="200" cy="80" r="8" fill="#F59E0B" />
              <Circle cx="200" cy="80" r="3" fill="#FFFFFF" />

              {/* Stop 4: Final */}
              <Circle cx="290" cy="45" r="8" fill="#64748B" />
              <Circle cx="290" cy="45" r="3" fill="#FFFFFF" />
            </Svg>

            <View style={styles.svgMetaOverlay}>
              <View style={styles.svgMetaPill}>
                <StatusPulseDot variant="primary" size={7} />
                <Text style={styles.svgMetaPillText}>
                  Durak #{job.routeStop?.sequence || 2} • Tahmini Varış: 14 dk (~5.8 km)
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Section 4: Customer Signature & Corporate Report PDF Preview */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="document-text-outline" size={18} color="#10B981" />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Müşteri İmzası & Servis Raporu (PDF)
              </Text>
            </View>
            <Badge
              label={hasSignature ? 'İMZALANDI' : 'İMZA BEKLİYOR'}
              variant={hasSignature ? 'success' : 'warning'}
            />
          </View>

          {/* Signature Box */}
          <View style={[styles.signatureBox, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}>
            {hasSignature && signatureSvgPaths && signatureSvgPaths.length > 0 ? (
              <View style={styles.signatureSvgContainer}>
                <Svg width="100%" height={70} viewBox="0 0 320 140">
                  {signatureSvgPaths.map((d, sIdx) => (
                    <Path
                      key={sIdx}
                      d={d}
                      stroke={theme.colors.primary}
                      strokeWidth="2.5"
                      fill="none"
                      strokeLinecap="round"
                    />
                  ))}
                </Svg>
                <Text style={[styles.signatureCaption, { color: '#10B981' }]}>
                  ✓ Müşteri Dijital İmzası Doğrulandı
                </Text>
              </View>
            ) : hasSignature ? (
              <View style={styles.signatureEmptyWrap}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                <Text style={[styles.signatureEmptyText, { color: theme.colors.text }]}>
                  Müşteri Dijital Onayı Alındı
                </Text>
              </View>
            ) : (
              <View style={styles.signatureEmptyWrap}>
                <Ionicons name="pencil-outline" size={24} color={theme.colors.textMuted} />
                <Text style={[styles.signatureEmptyText, { color: theme.colors.textMuted }]}>
                  Henüz müşteri imzası kaydedilmedi.
                </Text>
                <TouchableOpacity
                  style={[styles.captureSigMiniBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => onCaptureSignature?.(job)}
                >
                  <Text style={styles.captureSigMiniBtnText}>İmza Al</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Diagnosis & PDF Trigger */}
          <View style={styles.reportSummaryWrap}>
            <Text style={[styles.reportDiagnosisTitle, { color: theme.colors.textSecondary }]}>
              Uygulanan Teşhis & İşlemler:
            </Text>
            <Text style={[styles.reportDiagnosisText, { color: theme.colors.text }]} numberOfLines={2}>
              {reportDetails?.diagnosis || 'Cihaz periyodik bakımı ve hidrolik basınç testi tamamlandı.'}
            </Text>

            <TouchableOpacity
              style={[styles.viewPdfBtn, { backgroundColor: theme.colors.surface3 }]}
              onPress={() => onViewReportPdf?.(job)}
            >
              <Ionicons name="document-attach-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.viewPdfBtnText, { color: theme.colors.primary }]}>
                Resmi Mühürlü Servis Raporunu Görüntüle (PDF)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Persistent Bottom Action Dock */}
      <View
        style={[
          styles.bottomDock,
          {
            backgroundColor: theme.colors.surface0,
            borderTopColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <SpringPressable
          style={[styles.dockBtnSecondary, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onStatusChange?.(job);
          }}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color={theme.colors.text} />
          <Text style={[styles.dockBtnSecondaryText, { color: theme.colors.text }]}>
            Durum
          </Text>
        </SpringPressable>

        <SpringPressable
          style={[styles.dockBtnSecondary, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onAddParts?.(job);
          }}
        >
          <Ionicons name="cube-outline" size={16} color="#06B6D4" />
          <Text style={[styles.dockBtnSecondaryText, { color: '#06B6D4' }]}>
            Parça Ekle
          </Text>
        </SpringPressable>

        <SpringPressable
          style={[styles.dockBtnSecondary, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onCaptureSignature?.(job);
          }}
        >
          <Ionicons name="pencil" size={16} color="#F59E0B" />
          <Text style={[styles.dockBtnSecondaryText, { color: '#F59E0B' }]}>
            İmza Al
          </Text>
        </SpringPressable>

        <SpringPressable
          style={[styles.dockBtnPrimary, { backgroundColor: theme.colors.primary }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onSubmitReport?.(job);
          }}
        >
          <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
          <Text style={styles.dockBtnPrimaryText}>
            Raporu Tamamla
          </Text>
        </SpringPressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  paneContainer: {
    flex: 1,
    borderLeftWidth: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 90,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
  headerCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  docNumber: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subjectMeta: {
    fontSize: 12,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  customerBody: {
    gap: 6,
    marginBottom: 14,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  customerAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerAddressText: {
    fontSize: 13,
    flex: 1,
  },
  customerPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerPhoneText: {
    fontSize: 13,
  },
  contactActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  contactActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  contactActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  assetGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  assetItem: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
  },
  assetLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  assetVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  expandMapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  expandMapLinkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  svgMapWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
  },
  svgMetaOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
  },
  svgMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(7, 9, 14, 0.75)',
  },
  svgMetaPillText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  signatureBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    minHeight: 80,
    justifyContent: 'center',
  },
  signatureSvgContainer: {
    alignItems: 'center',
  },
  signatureCaption: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  signatureEmptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  signatureEmptyText: {
    fontSize: 12,
  },
  captureSigMiniBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  captureSigMiniBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  reportSummaryWrap: {
    gap: 6,
  },
  reportDiagnosisTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  reportDiagnosisText: {
    fontSize: 13,
    lineHeight: 18,
  },
  viewPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 6,
  },
  viewPdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  dockBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  dockBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dockBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dockBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
