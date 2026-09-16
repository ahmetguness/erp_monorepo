import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  Employee,
  LeaveType,
  LeaveBalanceSummary,
  LEAVE_TYPE_META,
  createLeaveRequest,
} from '../../services/hr.service';

export interface NewLeaveRequestModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: Employee | null;
  balance: LeaveBalanceSummary;
}

const LEAVE_TYPES: LeaveType[] = [
  'ANNUAL',
  'SICK',
  'OTHER',
  'UNPAID',
  'MATERNITY',
  'PATERNITY',
];

export const NewLeaveRequestModal: React.FC<NewLeaveRequestModalProps> = ({
  visible,
  onClose,
  onSuccess,
  employee,
  balance,
}) => {
  const { theme } = useTheme();

  const [selectedType, setSelectedType] = useState<LeaveType>('ANNUAL');

  // Format today and tomorrow for quick defaults
  const today = new Date();
  const nextDay = new Date(today);
  nextDay.setDate(today.getDate() + 1);

  const toDateString = (d: Date) => d.toISOString().split('T')[0];

  const [startDateStr, setStartDateStr] = useState<string>(toDateString(today));
  const [endDateStr, setEndDateStr] = useState<string>(toDateString(nextDay));
  const [days, setDays] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute days difference whenever dates change
  useEffect(() => {
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
        const diffMs = e.getTime() - s.getTime();
        const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        setDays(diffDays);
      }
    } catch {
      // Keep default
    }
  }, [startDateStr, endDateStr]);

  const handleSubmit = async () => {
    if (!employee) {
      Alert.alert('Hata', 'Çalışan bilgisi bulunamadı.');
      return;
    }

    const s = new Date(startDateStr);
    const e = new Date(endDateStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      Alert.alert('Hata', 'Lütfen geçerli bir tarih giriniz (YYYY-AA-GG).');
      return;
    }

    if (e < s) {
      Alert.alert('Hata', 'Bitiş tarihi başlangıç tarihinden önce olamaz.');
      return;
    }

    if (days <= 0) {
      Alert.alert('Hata', 'İzin süresi en az 1 gün olmalıdır.');
      return;
    }

    if (selectedType === 'ANNUAL' && days > balance.remainingAnnual) {
      Alert.alert(
        'Yıllık İzin Bakiyesi Yetersiz',
        `Kalan yıllık izniniz ${balance.remainingAnnual} gündür. Talep ettiğiniz gün sayısı (${days}) kalan bakiyenizi aşıyor. Yine de devam edilsin mi?`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Devam Et', onPress: () => doCreateRequest() },
        ],
      );
      return;
    }

    await doCreateRequest();
  };

  const doCreateRequest = async () => {
    if (!employee) return;
    try {
      setIsSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      await createLeaveRequest({
        employeeId: employee.id,
        type: selectedType,
        startDate: new Date(startDateStr).toISOString(),
        endDate: new Date(endDateStr).toISOString(),
        days,
        notes: notes.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      Alert.alert(
        'İzin Talebi Gönderildi',
        'İzin talebiniz başarıyla oluşturuldu ve yöneticinizin onayına iletildi.',
        [
          {
            text: 'Tamam',
            onPress: () => {
              onSuccess();
              onClose();
            },
          },
        ],
      );
    } catch (err: unknown) {
      console.warn('[NewLeaveRequestModal] Submit error:', err);
      const serverMsg =
        (err as any)?.response?.data?.error?.message ||
        (err as any)?.response?.data?.message ||
        (err instanceof Error ? err.message : null);
      const msg = serverMsg || 'Talep oluşturulurken bir hata oluştu.';
      Alert.alert('Hata', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalRoot, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.borderSubtle }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Yeni İzin Talebi</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Employee Badge Summary */}
          {employee && (
            <View style={[styles.empInfoBox, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
              <View style={[styles.empAvatar, { backgroundColor: '#e0f2fe' }]}>
                <Ionicons name="person" size={18} color="#0284c7" />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.empName, { color: theme.colors.text }]}>
                  {employee.firstName} {employee.lastName}
                </Text>
                <Text style={[styles.empDept, { color: theme.colors.textMuted }]}>
                  {employee.department || 'Genel Departman'} • {employee.position || 'Personel'}
                </Text>
              </View>
            </View>
          )}

          {/* Leave Type Selector Pills */}
          <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>İZİN TÜRÜ *</Text>
          <View style={styles.typeGrid}>
            {LEAVE_TYPES.map((t) => {
              const meta = LEAVE_TYPE_META[t];
              const isSelected = selectedType === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: isSelected ? meta.color : theme.colors.surfaceCard,
                      borderColor: isSelected ? meta.color : theme.colors.borderSubtle,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedType(t);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={meta.icon as any}
                    size={16}
                    color={isSelected ? '#ffffff' : meta.color}
                  />
                  <Text style={[styles.typePillText, { color: isSelected ? '#ffffff' : theme.colors.text }]}>
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Dates Input Grid */}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>BAŞLANGIÇ TARİHİ *</Text>
              <TextInput
                style={[styles.dateInput, { backgroundColor: theme.colors.surfaceCard, color: theme.colors.text, borderColor: theme.colors.borderSubtle }]}
                placeholder="YYYY-AA-GG"
                placeholderTextColor={theme.colors.textMuted}
                value={startDateStr}
                onChangeText={setStartDateStr}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>BİTİŞ TARİHİ *</Text>
              <TextInput
                style={[styles.dateInput, { backgroundColor: theme.colors.surfaceCard, color: theme.colors.text, borderColor: theme.colors.borderSubtle }]}
                placeholder="YYYY-AA-GG"
                placeholderTextColor={theme.colors.textMuted}
                value={endDateStr}
                onChangeText={setEndDateStr}
              />
            </View>
          </View>

          {/* Days Summary Badge Box */}
          <View style={[styles.daysSummaryBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
            <Ionicons name="calendar" size={20} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={styles.daysSummaryTitle}>Hesaplanan İzin Süresi</Text>
              <Text style={styles.daysSummaryValue}>{days} Günlük İzin</Text>
            </View>
            <View style={styles.balanceReminder}>
              <Text style={styles.balanceReminderLabel}>Kalan Yıllık İzin:</Text>
              <Text style={styles.balanceReminderVal}>{balance.remainingAnnual} Gün</Text>
            </View>
          </View>

          {/* Notes & Replacement Colleague */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>AÇIKLAMA / VEKİL NOTU</Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: theme.colors.surfaceCard, color: theme.colors.text, borderColor: theme.colors.borderSubtle }]}
              placeholder="İzin sebebi, acil durum irtibatı veya yerinize bakacak vekil personel..."
              placeholderTextColor={theme.colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Footer Bar */}
        <View style={[styles.footerBar, { borderTopColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceCard }]}>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>İzin Talebini Onaya Gönder</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  empInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  empAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empName: {
    fontSize: 13,
    fontWeight: '700',
  },
  empDept: {
    fontSize: 11,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  dateInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  daysSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  daysSummaryTitle: {
    fontSize: 10,
    color: '#15803d',
    fontWeight: '600',
  },
  daysSummaryValue: {
    fontSize: 14,
    color: '#15803d',
    fontWeight: '800',
  },
  balanceReminder: {
    alignItems: 'flex-end',
  },
  balanceReminderLabel: {
    fontSize: 10,
    color: '#15803d',
  },
  balanceReminderVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  inputGroup: {
    marginBottom: 16,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    height: 72,
    textAlignVertical: 'top',
  },
  footerBar: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
