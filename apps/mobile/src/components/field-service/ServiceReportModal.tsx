import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  FieldServiceJob,
  createFieldCheckpoint,
  updateServiceRequestStatus,
} from '../../services/field-service.service';

export interface ServiceReportModalProps {
  visible: boolean;
  job: FieldServiceJob | null;
  onClose: () => void;
  onReportSubmitted: (jobId: string, diagnosis?: string, actionsTaken?: string) => void;
}

export const ServiceReportModal: React.FC<ServiceReportModalProps> = ({
  visible,
  job,
  onClose,
  onReportSubmitted,
}) => {
  const { theme } = useTheme();

  const [diagnosis, setDiagnosis] = useState('');
  const [actionsTaken, setActionsTaken] = useState('');
  const [customerName, setCustomerName] = useState(job?.contact?.name || '');
  const [completeJob, setCompleteJob] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!job) return null;

  const handleSubmit = async () => {
    if (!diagnosis.trim() || !actionsTaken.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen arıza teşhisi ve uygulanan çözüm açıklamalarını doldurun.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSubmitting(true);
    try {
      const fullReportNote = `TEŞHİS: ${diagnosis.trim()} | UYGULANAN İŞLEM: ${actionsTaken.trim()}`;

      // 1. Submit SERVICE_FORM checkpoint
      await createFieldCheckpoint(job.id, 'SERVICE_FORM', {
        note: fullReportNote,
        customerName: customerName.trim() || undefined,
      });

      // 2. If user selected to complete, update status to COMPLETED
      if (completeJob) {
        await updateServiceRequestStatus(
          job.id,
          'COMPLETED',
          `Saha servis formu kapatıldı. ${fullReportNote}`
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onReportSubmitted(job.id, diagnosis.trim(), actionsTaken.trim());
      onClose();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Hata', err?.response?.data?.message || 'Servis formu gönderilemedi.');
    } finally {
      setIsSubmitting(false);
    }
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
          <View>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Teknik Servis Raporu
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
              {job.number} • {job.contact?.name || 'Müşteri'}
            </Text>
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
          {/* Summary Card */}
          <View
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
            <Text style={[styles.subjectTitle, { color: theme.colors.text }]}>
              {job.subject}
            </Text>
            {Boolean(job.asset) && (
              <Text style={[styles.assetText, { color: theme.colors.textSecondary }]}>
                Cihaz: {job.asset?.name} {job.asset?.brand ? `• ${job.asset.brand}` : ''}{' '}
                {job.asset?.serialNo ? `(Seri: ${job.asset.serialNo})` : ''}
              </Text>
            )}
          </View>

          {/* Form Inputs */}
          <View
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
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                Tespit Edilen Arıza / Kök Neden *
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="Örn: Voltaj dalgalanması kaynaklı regülatör arızası ve sigorta atması tespit edildi..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={3}
                value={diagnosis}
                onChangeText={setDiagnosis}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                Yapılan Müdahale ve Çözüm *
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="Örn: Güç kartı söküldü, yeni kart monte edildi, testler başarıyla tamamlandı..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={3}
                value={actionsTaken}
                onChangeText={setActionsTaken}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                Müşteri / Teslim Alan Yetkili
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="Yetkili adı..."
                placeholderTextColor={theme.colors.textMuted}
                value={customerName}
                onChangeText={setCustomerName}
              />
            </View>

            {/* Complete status checkbox toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setCompleteJob((prev) => !prev);
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={completeJob ? 'checkbox' : 'square-outline'}
                size={22}
                color={completeJob ? theme.colors.primary : theme.colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { color: theme.colors.text }]}>
                  Talebi "Tamamlandı" Olarak Kapat
                </Text>
                <Text style={[styles.toggleDesc, { color: theme.colors.textMuted }]}>
                  Rapor onaylandığında servis durumu otomatik tamamlandı olarak işlenir
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Footer Submit CTA */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
              ...theme.shadows.md,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.colors.primary }]}
            disabled={isSubmitting}
            onPress={handleSubmit}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="document-text" size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>Servis Raporunu Kaydet & Kapat</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
    paddingBottom: 40,
  },
  card: {
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  subjectTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  assetText: {
    fontSize: 12,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
  },
  textArea: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
