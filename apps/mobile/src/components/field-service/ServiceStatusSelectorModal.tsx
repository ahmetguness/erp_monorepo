import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  FieldServiceJob,
  ServiceStatus,
  updateServiceRequestStatus,
} from '../../services/field-service.service';

export interface ServiceStatusSelectorModalProps {
  visible: boolean;
  job: FieldServiceJob | null;
  onClose: () => void;
  onStatusUpdated: (updatedJobId: string, newStatus: ServiceStatus) => void;
}

const STATUS_CHOICES: Array<{
  status: ServiceStatus;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  {
    status: 'IN_PROGRESS',
    label: 'Müdahale Başladı',
    description: 'Teknisyen sahaya vardı, arıza tespit ve onarım başladı.',
    icon: 'play-circle',
    color: '#0284c7',
  },
  {
    status: 'WAITING_PARTS',
    label: 'Parça Bekleniyor',
    description: 'Onarım için gerekli yedek parça temini bekleniyor.',
    icon: 'time',
    color: '#f59e0b',
  },
  {
    status: 'WAITING_CUSTOMER',
    label: 'Müşteri Bekleniyor',
    description: 'Müşteri onayı, cihaz teslimi veya randevu bekleniyor.',
    icon: 'person',
    color: '#d97706',
  },
  {
    status: 'COMPLETED',
    label: 'Tamamlandı',
    description: 'Saha onarım ve test işlemleri başarıyla bitti.',
    icon: 'checkmark-circle',
    color: '#10b981',
  },
  {
    status: 'OPEN',
    label: 'Açık / Beklemede',
    description: 'Talep açık durumda, iş emri sırada bekliyor.',
    icon: 'pause-circle',
    color: '#64748b',
  },
  {
    status: 'CANCELLED',
    label: 'İptal Edildi',
    description: 'Talep iptal edildi veya mükerrer kayıt.',
    icon: 'close-circle',
    color: '#ef4444',
  },
];

export const ServiceStatusSelectorModal: React.FC<ServiceStatusSelectorModalProps> = ({
  visible,
  job,
  onClose,
  onStatusUpdated,
}) => {
  const { theme } = useTheme();

  const [selectedStatus, setSelectedStatus] = useState<ServiceStatus>(
    job?.status || 'IN_PROGRESS'
  );
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (job) {
      setSelectedStatus(job.status);
      setNotes('');
    }
  }, [job]);

  if (!job) return null;

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSubmitting(true);
    try {
      await updateServiceRequestStatus(job.id, selectedStatus, notes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onStatusUpdated(job.id, selectedStatus);
      onClose();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Hata', err?.response?.data?.message || 'Durum güncellenemedi.');
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
              Servis Durumunu Güncelle
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

        <View style={styles.content}>
          {/* Status choices */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Yeni Aşama Seçin
          </Text>

          <View style={styles.choicesGrid}>
            {STATUS_CHOICES.map((choice) => {
              const isSelected = selectedStatus === choice.status;
              return (
                <TouchableOpacity
                  key={choice.status}
                  style={[
                    styles.choiceCard,
                    {
                      backgroundColor: theme.colors.surfaceCard,
                      borderColor: isSelected ? choice.color : theme.colors.borderSubtle,
                      borderWidth: isSelected ? 2 : 1,
                      borderRadius: theme.borderRadius.md,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedStatus(choice.status);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: isSelected ? choice.color : theme.colors.borderSubtle },
                    ]}
                  >
                    <Ionicons
                      name={choice.icon}
                      size={18}
                      color={isSelected ? '#ffffff' : theme.colors.textSecondary}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.choiceLabel,
                        { color: isSelected ? choice.color : theme.colors.text },
                      ]}
                    >
                      {choice.label}
                    </Text>
                    <Text
                      style={[styles.choiceDesc, { color: theme.colors.textMuted }]}
                      numberOfLines={2}
                    >
                      {choice.description}
                    </Text>
                  </View>

                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={choice.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Notes input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
              Aşama Notu / Açıklama
            </Text>
            <TextInput
              style={[
                styles.notesInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
              placeholder="Yapılan müdahale, parça kodu veya durum detayı..."
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </View>
        </View>

        {/* Footer save CTA */}
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
            style={[styles.saveBtn, { backgroundColor: theme.colors.primary }]}
            disabled={isSubmitting}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={18} color="#ffffff" />
                <Text style={styles.saveBtnText}>Durumu Kaydet & Güncelle</Text>
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
  content: {
    padding: 16,
    gap: 12,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  choicesGrid: {
    gap: 8,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  choiceDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  inputGroup: {
    gap: 6,
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  notesInput: {
    padding: 12,
    borderWidth: 1,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
