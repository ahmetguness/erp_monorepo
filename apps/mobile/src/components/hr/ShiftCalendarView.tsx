import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { AttendanceRecord, Employee } from '../../services/hr.service';
import { Badge } from '../common/Badge';

export interface ShiftCalendarViewProps {
  employee: Employee;
  attendances: AttendanceRecord[];
  onClockIn: (notes?: string) => Promise<void>;
  onClockOut: (overtimeHours?: number) => Promise<void>;
  isClocking: boolean;
}

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function formatTime(iso?: string | null): string {
  if (!iso) return '--:--';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function getDayString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate the 7 days of current week (Mon -> Sun)
function getWeekDates(referenceDate: Date = new Date()): Date[] {
  const current = new Date(referenceDate);
  const dayOfWeek = current.getDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(current);
  monday.setDate(current.getDate() + distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    week.push(d);
  }
  return week;
}

export const ShiftCalendarView: React.FC<ShiftCalendarViewProps> = ({
  attendances,
  onClockIn,
  onClockOut,
  isClocking,
}) => {
  const { theme } = useTheme();

  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0);
  const [clockOutModalVisible, setClockOutModalVisible] = useState(false);
  const [overtimeInput, setOvertimeInput] = useState('');

  const now = new Date();
  const todayStr = getDayString(now);

  // Current week days
  const weekDays = getWeekDates(now);
  const selectedDate = weekDays[selectedDayOffset] ?? now;
  const selectedDateStr = getDayString(selectedDate);

  // Match attendance records
  const todayAttendance = attendances.find((a) => {
    return (
      a.date === todayStr ||
      (a.checkIn && getDayString(new Date(a.checkIn)) === todayStr)
    );
  });

  const selectedAttendance = attendances.find((a) => {
    return (
      a.date === selectedDateStr ||
      (a.checkIn && getDayString(new Date(a.checkIn)) === selectedDateStr)
    );
  });

  // Determine current attendance state for today
  const isClockedInToday = Boolean(todayAttendance?.checkIn && !todayAttendance?.checkOut);
  const isCompletedToday = Boolean(todayAttendance?.checkIn && todayAttendance?.checkOut);

  // Weekly stats
  const totalWeeklyOvertime = attendances.reduce(
    (acc, cur) => acc + (cur.overtimeHours || 0),
    0,
  );
  const totalCompletedDays = attendances.filter((a) => a.checkIn && a.checkOut).length;

  const handleClockInPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Alert.alert(
      'Mesai Başlat',
      'Bugünkü mesainizi başlatmak ve giriş damgası basmak istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Giriş Yap',
          onPress: async () => {
            await onClockIn();
          },
        },
      ],
    );
  };

  const handleClockOutPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setOvertimeInput('');
    setClockOutModalVisible(true);
  };

  const handleConfirmClockOut = async () => {
    const ot = parseFloat(overtimeInput.replace(',', '.')) || 0;
    setClockOutModalVisible(false);
    await onClockOut(ot);
  };

  return (
    <View style={styles.container}>
      {/* Real-time Clock Stamping Card */}
      <View
        style={[
          styles.stampCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: isClockedInToday
              ? theme.colors.primary
              : theme.colors.border,
          },
        ]}
      >
        <View style={styles.stampHeader}>
          <View>
            <Text style={[styles.stampTitle, { color: theme.colors.text }]}>
              Dijital Puantaj & Damga
            </Text>
            <Text style={[styles.stampSubtitle, { color: theme.colors.textMuted }]}>
              Vardiya Saatleri: 08:30 - 17:30
            </Text>
          </View>
          {isClockedInToday ? (
            <Badge label="Mesaide" variant="success" badgeStyle="solid" size="sm" dot />
          ) : isCompletedToday ? (
            <Badge label="Tamamlandı" variant="primary" badgeStyle="subtle" size="sm" />
          ) : (
            <Badge label="Giriş Yapılmadı" variant="neutral" badgeStyle="subtle" size="sm" />
          )}
        </View>

        {/* Live Attendance State Display */}
        <View style={[styles.stampTimesRow, { backgroundColor: theme.colors.background }]}>
          <View style={styles.stampTimeBox}>
            <View style={styles.timeIconLabel}>
              <Ionicons name="log-in-outline" size={16} color="#0284c7" />
              <Text style={[styles.stampTimeLabel, { color: theme.colors.textMuted }]}>
                GİRİŞ
              </Text>
            </View>
            <Text style={[styles.stampTimeVal, { color: theme.colors.text }]}>
              {formatTime(todayAttendance?.checkIn)}
            </Text>
          </View>

          <View style={styles.stampDivider} />

          <View style={styles.stampTimeBox}>
            <View style={styles.timeIconLabel}>
              <Ionicons name="log-out-outline" size={16} color="#e11d48" />
              <Text style={[styles.stampTimeLabel, { color: theme.colors.textMuted }]}>
                ÇIKIŞ
              </Text>
            </View>
            <Text style={[styles.stampTimeVal, { color: theme.colors.text }]}>
              {formatTime(todayAttendance?.checkOut)}
            </Text>
          </View>

          {Boolean(todayAttendance?.overtimeHours && todayAttendance.overtimeHours > 0) && (
            <>
              <View style={styles.stampDivider} />
              <View style={styles.stampTimeBox}>
                <View style={styles.timeIconLabel}>
                  <Ionicons name="flash-outline" size={16} color="#d97706" />
                  <Text style={[styles.stampTimeLabel, { color: '#d97706' }]}>MESAI</Text>
                </View>
                <Text style={[styles.stampTimeVal, { color: '#d97706' }]}>
                  +{todayAttendance?.overtimeHours}s
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Action Button */}
        <View style={styles.stampActionWrap}>
          {isClocking ? (
            <View style={styles.loadingBtn}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                Puantaj işleniyor...
              </Text>
            </View>
          ) : !isClockedInToday && !isCompletedToday ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleClockInPress}
            >
              <Ionicons name="finger-print-outline" size={20} color="#ffffff" />
              <Text style={styles.actionBtnText}>Mesai Başlat (Giriş Damgası)</Text>
            </TouchableOpacity>
          ) : isClockedInToday ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.colors.danger }]}
              onPress={handleClockOutPress}
            >
              <Ionicons name="log-out-outline" size={20} color="#ffffff" />
              <Text style={styles.actionBtnText}>Mesaiyi Bitir (Çıkış Damgası)</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.completedBanner, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="checkmark-done-circle" size={20} color="#16a34a" />
              <Text style={[styles.completedBannerText, { color: '#166534' }]}>
                Bugünkü mesainiz başarıyla tamamlandı.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Week Calendar Strip */}
      <View
        style={[
          styles.calendarContainer,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.calendarHeader}>
          <Text style={[styles.calendarTitle, { color: theme.colors.text }]}>
            Haftalık Çizelge
          </Text>
          <Text style={[styles.calendarSubtitle, { color: theme.colors.textMuted }]}>
            {weekDays[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} -{' '}
            {weekDays[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
          </Text>
        </View>

        {/* Day Pills */}
        <View style={styles.dayPillsRow}>
          {weekDays.map((d, index) => {
            const dStr = getDayString(d);
            const isToday = dStr === todayStr;
            const isSelected = index === selectedDayOffset;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

            const att = attendances.find((a) => {
              return (
                a.date === dStr ||
                (a.checkIn && getDayString(new Date(a.checkIn)) === dStr)
              );
            });
            const hasAtt = Boolean(att?.checkIn);

            return (
              <TouchableOpacity
                key={dStr}
                style={[
                  styles.dayPill,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : isToday
                      ? theme.colors.primaryMuted
                      : theme.colors.background,
                    borderColor: isToday ? theme.colors.primary : 'transparent',
                    borderWidth: isToday ? 1.5 : 0,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedDayOffset(index);
                }}
              >
                <Text
                  style={[
                    styles.dayPillName,
                    {
                      color: isSelected
                        ? '#ffffff'
                        : isWeekend
                        ? theme.colors.textMuted
                        : theme.colors.text,
                    },
                  ]}
                >
                  {DAY_NAMES[index]}
                </Text>
                <Text
                  style={[
                    styles.dayPillNum,
                    {
                      color: isSelected
                        ? '#ffffff'
                        : isToday
                        ? theme.colors.primary
                        : theme.colors.text,
                    },
                  ]}
                >
                  {d.getDate()}
                </Text>
                {/* Dot for Attendance */}
                <View
                  style={[
                    styles.attDot,
                    {
                      backgroundColor: hasAtt
                        ? isSelected
                          ? '#ffffff'
                          : '#16a34a'
                        : isWeekend
                        ? 'transparent'
                        : isSelected
                        ? 'rgba(255,255,255,0.4)'
                        : '#cbd5e1',
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Day Details */}
        <View style={[styles.dayDetailBox, { backgroundColor: theme.colors.background }]}>
          <View style={styles.dayDetailHeader}>
            <Text style={[styles.dayDetailTitle, { color: theme.colors.text }]}>
              {selectedDate.toLocaleDateString('tr-TR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            {selectedDateStr === todayStr && (
              <Badge label="Bugün" variant="primary" badgeStyle="solid" size="sm" />
            )}
          </View>

          {selectedAttendance ? (
            <View style={styles.detailStatsRow}>
              <View style={styles.detailStatItem}>
                <Text style={[styles.detailStatLabel, { color: theme.colors.textMuted }]}>
                  Giriş
                </Text>
                <Text style={[styles.detailStatVal, { color: theme.colors.text }]}>
                  {formatTime(selectedAttendance.checkIn)}
                </Text>
              </View>
              <View style={styles.detailStatItem}>
                <Text style={[styles.detailStatLabel, { color: theme.colors.textMuted }]}>
                  Çıkış
                </Text>
                <Text style={[styles.detailStatVal, { color: theme.colors.text }]}>
                  {formatTime(selectedAttendance.checkOut)}
                </Text>
              </View>
              <View style={styles.detailStatItem}>
                <Text style={[styles.detailStatLabel, { color: theme.colors.textMuted }]}>
                  Fazla Mesai
                </Text>
                <Text style={[styles.detailStatVal, { color: theme.colors.primary }]}>
                  {selectedAttendance.overtimeHours ? `${selectedAttendance.overtimeHours} sa` : '-'}
                </Text>
              </View>
            </View>
          ) : selectedDate.getDay() === 0 || selectedDate.getDay() === 6 ? (
            <Text style={[styles.emptyNotice, { color: theme.colors.textMuted }]}>
              Hafta sonu tatili. Planlı vardiya bulunmuyor.
            </Text>
          ) : (
            <Text style={[styles.emptyNotice, { color: theme.colors.textMuted }]}>
              Bu güne ait puantaj kaydı bulunmamaktadır.
            </Text>
          )}
        </View>

        {/* Quick Weekly KPI footer */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.kpiLabel, { color: theme.colors.textSecondary }]}>
              Tamamlanan Gün: <Text style={styles.kpiValue}>{totalCompletedDays} / 5</Text>
            </Text>
          </View>
          <View style={styles.kpiItem}>
            <Ionicons name="time-outline" size={16} color="#d97706" />
            <Text style={[styles.kpiLabel, { color: theme.colors.textSecondary }]}>
              Fazla Mesai: <Text style={styles.kpiValue}>{totalWeeklyOvertime} saat</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Clock-Out Overtime Modal */}
      <Modal
        visible={clockOutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setClockOutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="log-out-outline" size={24} color="#dc2626" />
              </View>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Mesaiyi Tamamla
              </Text>
              <Text style={[styles.modalSubtitle, { color: theme.colors.textMuted }]}>
                Çıkış damganızı kaydetmeden önce varsa fazla mesai sürenizi giriniz.
              </Text>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                Fazla Mesai (Saat cinsinden - Opsiyonel)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.background,
                  },
                ]}
                placeholder="Örn: 1.5 veya 2"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                value={overtimeInput}
                onChangeText={setOvertimeInput}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.colors.border }]}
                onPress={() => setClockOutModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.colors.textSecondary }]}>
                  Vazgeç
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: theme.colors.danger }]}
                onPress={handleConfirmClockOut}
              >
                <Text style={styles.modalConfirmText}>Çıkışı Onayla</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  stampCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  stampHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  stampTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  stampSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  stampTimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  stampTimeBox: {
    alignItems: 'center',
    flex: 1,
  },
  timeIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  stampTimeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stampTimeVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  stampDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#cbd5e1',
  },
  stampActionWrap: {},
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
  },
  completedBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  calendarContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  calendarTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  calendarSubtitle: {
    fontSize: 12,
  },
  dayPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dayPill: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    minWidth: 42,
  },
  dayPillName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  dayPillNum: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  attDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dayDetailBox: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  dayDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dayDetailTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  detailStatItem: {
    alignItems: 'center',
  },
  detailStatLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  detailStatVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyNotice: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 6,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  kpiItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiLabel: {
    fontSize: 12,
  },
  kpiValue: {
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalBody: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
