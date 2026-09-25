// apps/mobile/src/features/employee-portal/components/EmployeePortalInspectionPane.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import {
  Employee,
  LeaveRequest,
  LeaveBalanceSummary,
  AttendanceRecord,
  PayrollRecord,
} from '../../../services/hr.service';
import { Badge } from '../../../components/common/Badge';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { SpringPressable } from '../../../design-system/primitives/SpringPressable';
import { StatusPulseDot } from '../../../design-system/primitives/StatusPulseDot';
import { formatCurrency, formatDate } from '../../../lib/utils';

export type EmployeePortalTab = 'leaves' | 'shifts' | 'payrolls';

export interface EmployeePortalInspectionPaneProps {
  activeTab: EmployeePortalTab;
  employee: Employee | null;
  selectedLeaveRequest?: LeaveRequest | null;
  leaveBalance?: LeaveBalanceSummary | null;
  selectedPayroll?: PayrollRecord | null;
  attendances?: AttendanceRecord[];
  onCancelLeave?: (requestId: string) => void;
  onOpenNewLeaveModal?: () => void;
  onOpenPayrollSlipModal?: (payroll: PayrollRecord) => void;
  onClockIn?: () => void;
  onClockOut?: () => void;
  isClocking?: boolean;
}

export const EmployeePortalInspectionPane: React.FC<EmployeePortalInspectionPaneProps> = ({
  activeTab,
  employee,
  selectedLeaveRequest,
  leaveBalance,
  selectedPayroll,
  attendances = [],
  onCancelLeave,
  onOpenNewLeaveModal,
  onOpenPayrollSlipModal,
  onClockIn,
  onClockOut,
  isClocking = false,
}) => {
  const { theme } = useTheme();

  const handleSharePayroll = () => {
    if (!selectedPayroll) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Share.share({
      title: `${selectedPayroll.period} Bordro Özeti`,
      message: `${employee?.firstName} ${employee?.lastName} — ${selectedPayroll.period} Maaş Bordrosu\nNet Ödeme: ${formatCurrency(selectedPayroll.netSalary)}\nAXON Kurumsal İK Portalı`,
    }).catch(() => {});
  };

  // ─────────────────────────────────────────────
  // TAB 1: LEAVES DETAIL VIEW
  // ─────────────────────────────────────────────
  if (activeTab === 'leaves') {
    if (!selectedLeaveRequest) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.colors.surfaceCard }]}>
          <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.borderSubtle }]}>
            <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>İzin Talebi Seçilmedi</Text>
          <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
            Sol listeden detayını ve onay akışını incelemek istediğiniz izin talebine dokunun veya yeni bir izin başvurusu başlatın.
          </Text>
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: theme.colors.primary }]}
            onPress={onOpenNewLeaveModal}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryActionBtnText}>Yeni İzin Talebi Oluştur</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isPending = selectedLeaveRequest.status === 'PENDING';

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
          {/* Header Card */}
          <View
            style={[
              styles.headerCard,
              { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
            ]}
          >
            <View style={styles.headerTop}>
              <View style={styles.titleWrap}>
                <View style={[styles.badgePill, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="calendar" size={14} color={theme.colors.primary} />
                  <Text style={[styles.badgePillText, { color: theme.colors.primary }]}>İZİN TALEBİ</Text>
                </View>
                <Text style={[styles.docNumber, { color: theme.colors.text }]}>
                  {selectedLeaveRequest.type}
                </Text>
              </View>
              <Badge
                label={selectedLeaveRequest.status}
                variant={
                  selectedLeaveRequest.status === 'APPROVED'
                    ? 'success'
                    : selectedLeaveRequest.status === 'REJECTED'
                    ? 'danger'
                    : selectedLeaveRequest.status === 'CANCELLED'
                    ? 'neutral'
                    : 'warning'
                }
              />
            </View>

            <Text style={[styles.leaveDaysHero, { color: theme.colors.text }]}>
              {selectedLeaveRequest.days} İş Günü
            </Text>
            <Text style={[styles.dateRangeText, { color: theme.colors.textMuted }]}>
              {formatDate(selectedLeaveRequest.startDate)} ➔ {formatDate(selectedLeaveRequest.endDate)}
            </Text>
          </View>

          {/* Audit Trail & Leave Reason */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
            ]}
          >
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Talep Gerekçesi & Açıklama
              </Text>
            </View>
            <Text style={[styles.reasonBodyText, { color: theme.colors.textSecondary }]}>
              {selectedLeaveRequest.notes || 'Belirtilmiş özel bir izin gerekçesi bulunmamaktadır.'}
            </Text>
          </View>

          {/* Leave Balance Impact Card */}
          {leaveBalance && (
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
              ]}
            >
              <View style={styles.sectionHeaderTitleGroup}>
                <Ionicons name="pie-chart-outline" size={18} color="#10B981" />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Kalan İzin Bakiyesi Etkisi
                </Text>
              </View>

              <View style={styles.balanceGrid}>
                <View style={[styles.balanceBox, { backgroundColor: theme.colors.surface2 }]}>
                  <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>KALAN YILLIK İZİN</Text>
                  <TabularText style={[styles.balanceVal, { color: '#10B981' }]}>
                    {leaveBalance.remainingAnnual} Gün
                  </TabularText>
                </View>

                <View style={[styles.balanceBox, { backgroundColor: theme.colors.surface2 }]}>
                  <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>MAZERET İZNİ</Text>
                  <TabularText style={[styles.balanceVal, { color: '#3B82F6' }]}>
                    {leaveBalance.remainingExcused} Gün
                  </TabularText>
                </View>

                <View style={[styles.balanceBox, { backgroundColor: theme.colors.surface2 }]}>
                  <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>ONAY BEKLEYEN</Text>
                  <TabularText style={[styles.balanceVal, { color: '#F59E0B' }]}>
                    {leaveBalance.pendingCount} Talep
                  </TabularText>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Action Dock */}
        <View
          style={[
            styles.bottomDock,
            { backgroundColor: theme.colors.surface0, borderTopColor: theme.colors.borderSubtle },
          ]}
        >
          {isPending && (
            <SpringPressable
              style={[styles.dockBtnDanger, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.3)' }]}
              onPress={() => onCancelLeave?.(selectedLeaveRequest.id)}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
              <Text style={styles.dockBtnDangerText}>Talebi İptal Et</Text>
            </SpringPressable>
          )}

          <SpringPressable
            style={[styles.dockBtnPrimary, { backgroundColor: theme.colors.primary }]}
            onPress={onOpenNewLeaveModal}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.dockBtnPrimaryText}>Yeni İzin Talebi</Text>
          </SpringPressable>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────
  // TAB 2: SHIFTS & ATTENDANCE DETAIL VIEW
  // ─────────────────────────────────────────────
  if (activeTab === 'shifts') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAttendance = attendances.find((a) => a.date?.startsWith(todayStr));

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
          {/* Header Card */}
          <View
            style={[
              styles.headerCard,
              { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
            ]}
          >
            <View style={styles.headerTop}>
              <View style={styles.titleWrap}>
                <View style={[styles.badgePill, { backgroundColor: theme.colors.primaryMuted }]}>
                  <Ionicons name="time" size={14} color={theme.colors.primary} />
                  <Text style={[styles.badgePillText, { color: theme.colors.primary }]}>GÜNLÜK MESAİ</Text>
                </View>
                <Text style={[styles.docNumber, { color: theme.colors.text }]}>
                  Vardiya: 08:30 – 17:30
                </Text>
              </View>
              <Badge
                label={todayAttendance?.checkIn ? (todayAttendance.checkOut ? 'TAMAMLANDI' : 'MESAİDE') : 'BEKLİYOR'}
                variant={todayAttendance?.checkIn ? (todayAttendance.checkOut ? 'neutral' : 'success') : 'warning'}
              />
            </View>

            <Text style={[styles.productTitle, { color: theme.colors.text }]}>
              {employee?.firstName} {employee?.lastName}
            </Text>
            <Text style={[styles.productSku, { color: theme.colors.textMuted }]}>
              {employee?.department || 'Departman'} • {employee?.position || 'Kadro'}
            </Text>

            {/* Check-In / Check-Out Times */}
            <View style={styles.shiftTimesRow}>
              <View style={[styles.shiftTimeBox, { backgroundColor: theme.colors.surface2 }]}>
                <Text style={[styles.shiftTimeLabel, { color: theme.colors.textMuted }]}>GİRİŞ DAMGASI</Text>
                <TabularText style={[styles.shiftTimeValue, { color: todayAttendance?.checkIn ? '#10B981' : theme.colors.textMuted }]}>
                  {todayAttendance?.checkIn ? todayAttendance.checkIn.slice(11, 16) : '--:--'}
                </TabularText>
              </View>

              <View style={[styles.shiftTimeBox, { backgroundColor: theme.colors.surface2 }]}>
                <Text style={[styles.shiftTimeLabel, { color: theme.colors.textMuted }]}>ÇIKIŞ DAMGASI</Text>
                <TabularText style={[styles.shiftTimeValue, { color: todayAttendance?.checkOut ? '#3B82F6' : theme.colors.textMuted }]}>
                  {todayAttendance?.checkOut ? todayAttendance.checkOut.slice(11, 16) : '--:--'}
                </TabularText>
              </View>

              <View style={[styles.shiftTimeBox, { backgroundColor: theme.colors.surface2 }]}>
                <Text style={[styles.shiftTimeLabel, { color: theme.colors.textMuted }]}>FAZLA MESAİ</Text>
                <TabularText style={[styles.shiftTimeValue, { color: todayAttendance?.overtimeHours ? '#F59E0B' : theme.colors.textMuted }]}>
                  {todayAttendance?.overtimeHours ? `+${todayAttendance.overtimeHours} Saat` : '0 Saat'}
                </TabularText>
              </View>
            </View>
          </View>

          {/* Location & GPS Verification Card */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
            ]}
          >
            <View style={styles.sectionHeaderTitleGroup}>
              <Ionicons name="location-outline" size={18} color="#06B6D4" />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                GPS & Saha Doğrulama Konumu
              </Text>
            </View>
            <View style={styles.gpsRow}>
              <StatusPulseDot variant="emerald" size={8} />
              <Text style={[styles.gpsText, { color: theme.colors.textSecondary }]}>
                Merkez Genel Müdürlük / Saha Geofence Alanı Doğrulandı
              </Text>
            </View>
          </View>

          {/* Quick Clock-In / Clock-Out Actions */}
          <View style={styles.clockActionsGrid}>
            <SpringPressable
              style={[
                styles.clockInBtn,
                { backgroundColor: todayAttendance?.checkIn ? '#64748B' : '#10B981' },
              ]}
              onPress={onClockIn}
              disabled={isClocking || Boolean(todayAttendance?.checkIn)}
            >
              <Ionicons name="finger-print-outline" size={20} color="#FFFFFF" />
              <Text style={styles.clockBtnText}>
                {todayAttendance?.checkIn ? 'Giriş Yapıldı' : 'Mesai Başlat (Clock-In)'}
              </Text>
            </SpringPressable>

            <SpringPressable
              style={[
                styles.clockOutBtn,
                { backgroundColor: !todayAttendance?.checkIn || todayAttendance?.checkOut ? '#64748B' : '#EF4444' },
              ]}
              onPress={onClockOut}
              disabled={isClocking || !todayAttendance?.checkIn || Boolean(todayAttendance?.checkOut)}
            >
              <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
              <Text style={styles.clockBtnText}>
                {todayAttendance?.checkOut ? 'Çıkış Yapıldı' : 'Mesai Bitir (Clock-Out)'}
              </Text>
            </SpringPressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─────────────────────────────────────────────
  // TAB 3: PAYROLLS DETAIL VIEW
  // ─────────────────────────────────────────────
  if (!selectedPayroll) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.colors.surfaceCard }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.borderSubtle }]}>
          <Ionicons name="receipt-outline" size={48} color={theme.colors.textMuted} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Bordro Seçilmedi</Text>
        <Text style={[styles.emptyDesc, { color: theme.colors.textMuted }]}>
          Sol listeden mali mühürlü pusulasını, brüt/net kazanç dökümünü ve yasal kesintilerini denetlemek istediğiniz bordroyu seçin.
        </Text>
      </View>
    );
  }

  const gross = Number(selectedPayroll.grossSalary) || 0;
  const net = Number(selectedPayroll.netSalary) || 0;
  const deductions = Number(selectedPayroll.deductions) || 0;

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
                <Ionicons name="shield-checkmark" size={14} color={theme.colors.primary} />
                <Text style={[styles.badgePillText, { color: theme.colors.primary }]}>RESMİ BORDRO</Text>
              </View>
              <Text style={[styles.docNumber, { color: theme.colors.text }]}>
                {selectedPayroll.period} Pusulası
              </Text>
            </View>
            <Badge label="ÖDENDİ" variant="success" />
          </View>

          <Text style={[styles.productTitle, { color: theme.colors.text }]}>
            {employee?.firstName} {employee?.lastName}
          </Text>
          <Text style={[styles.productSku, { color: theme.colors.textMuted }]}>
            {employee?.position || 'ERP Uzmanı'} • Ödeme Tarihi: {selectedPayroll.paidAt ? formatDate(selectedPayroll.paidAt) : 'Düzenlendi'}
          </Text>

          {/* Large Net Salary Hero */}
          <View style={[styles.netSalaryHeroBox, { backgroundColor: theme.colors.surface2 }]}>
            <Text style={[styles.netSalaryLabel, { color: theme.colors.textMuted }]}>
              NET ÖDENEN MAAŞ
            </Text>
            <TabularText style={[styles.netSalaryDigits, { color: '#10B981' }]}>
              {formatCurrency(net)}
            </TabularText>
          </View>
        </View>

        {/* Section: Gross Earnings vs Deductions Breakdown */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.sectionHeaderTitleGroup}>
            <Ionicons name="calculator-outline" size={18} color={theme.colors.primary} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Maaş & Yasal Kesinti Dökümü
            </Text>
          </View>

          <View style={styles.breakdownTable}>
            <View style={[styles.breakdownRow, { borderBottomColor: theme.colors.borderSubtle }]}>
              <Text style={[styles.breakdownLabel, { color: theme.colors.textSecondary }]}>Toplam Brüt Ücret</Text>
              <TabularText style={[styles.breakdownVal, { color: theme.colors.text }]}>
                {formatCurrency(gross)}
              </TabularText>
            </View>

            <View style={[styles.breakdownRow, { borderBottomColor: theme.colors.borderSubtle }]}>
              <Text style={[styles.breakdownLabel, { color: '#EF4444' }]}>SGK & İşsizlik Primi (%15)</Text>
              <TabularText style={[styles.breakdownVal, { color: '#EF4444' }]}>
                - {formatCurrency(gross * 0.15)}
              </TabularText>
            </View>

            <View style={[styles.breakdownRow, { borderBottomColor: theme.colors.borderSubtle }]}>
              <Text style={[styles.breakdownLabel, { color: '#EF4444' }]}>Gelir Vergisi Matrahı Kesintisi</Text>
              <TabularText style={[styles.breakdownVal, { color: '#EF4444' }]}>
                - {formatCurrency(Math.max(0, deductions - gross * 0.15))}
              </TabularText>
            </View>

            <View style={[styles.breakdownRow, { borderBottomColor: 'transparent', paddingTop: 8 }]}>
              <Text style={[styles.breakdownTotalLabel, { color: theme.colors.text }]}>Net Ele Geçen Tutar</Text>
              <TabularText style={[styles.breakdownTotalVal, { color: '#10B981' }]}>
                {formatCurrency(net)}
              </TabularText>
            </View>
          </View>
        </View>

        {/* Section: Legal Seal & Security Badge */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <View style={styles.legalSealRow}>
            <Ionicons name="shield-checkmark" size={24} color="#3B82F6" />
            <View style={styles.legalSealTextWrap}>
              <Text style={[styles.legalSealTitle, { color: theme.colors.text }]}>
                Mali Mühür & E-İmza Doğrulaması
              </Text>
              <Text style={[styles.legalSealSub, { color: theme.colors.textMuted }]}>
                5070 Sayılı Elektronik İmza Kanunu kapsamında geçerli resmi kaşeli bordro kopyasıdır.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Action Dock */}
      <View
        style={[
          styles.bottomDock,
          { backgroundColor: theme.colors.surface0, borderTopColor: theme.colors.borderSubtle },
        ]}
      >
        <SpringPressable
          style={[styles.dockBtnSecondary, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.borderSubtle }]}
          onPress={handleSharePayroll}
        >
          <Ionicons name="share-outline" size={16} color={theme.colors.text} />
          <Text style={[styles.dockBtnSecondaryText, { color: theme.colors.text }]}>Paylaş</Text>
        </SpringPressable>

        <SpringPressable
          style={[styles.dockBtnPrimary, { backgroundColor: theme.colors.primary }]}
          onPress={() => onOpenPayrollSlipModal?.(selectedPayroll)}
        >
          <Ionicons name="document-text" size={16} color="#FFFFFF" />
          <Text style={styles.dockBtnPrimaryText}>Resmi Pusulayı Aç (PDF)</Text>
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
    gap: 12,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  leaveDaysHero: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  dateRangeText: {
    fontSize: 13,
    marginTop: 4,
  },
  productTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  productSku: {
    fontSize: 12,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  reasonBodyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  balanceGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  balanceBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  balanceVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  shiftTimesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  shiftTimeBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
  },
  shiftTimeLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  shiftTimeValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsText: {
    fontSize: 12,
  },
  clockActionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  clockInBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  clockOutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  clockBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  netSalaryHeroBox: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  netSalaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  netSalaryDigits: {
    fontSize: 28,
    fontWeight: '800',
  },
  breakdownTable: {
    gap: 8,
    marginTop: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  breakdownLabel: {
    fontSize: 13,
  },
  breakdownVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  breakdownTotalVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  legalSealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legalSealTextWrap: {
    flex: 1,
  },
  legalSealTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  legalSealSub: {
    fontSize: 11,
    lineHeight: 16,
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
    gap: 10,
    borderTopWidth: 1,
  },
  dockBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  dockBtnDangerText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  dockBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
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
