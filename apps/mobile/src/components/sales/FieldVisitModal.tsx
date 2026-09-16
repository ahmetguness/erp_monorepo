import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  FieldVisitData,
  VisitOutcome,
  completeFieldVisitSession,
  cancelActiveVisitSession,
} from '../../services/sales.service';

interface Props {
  visible: boolean;
  visit: FieldVisitData | null;
  onClose: () => void;
  onVisitCompleted: (completedVisit: FieldVisitData) => void;
  onVisitCancelled: () => void;
}

const OUTCOME_OPTIONS: Array<{ key: VisitOutcome; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { key: 'SIPARIS_ALINDI', label: 'Sipariş Alındı', icon: 'cart-outline', color: '#10b981' },
  { key: 'TEKLIF_VERILDI', label: 'Teklif Verildi', icon: 'document-text-outline', color: '#3b82f6' },
  { key: 'TAHSILAT_YAPILDI', label: 'Tahsilat Alındı', icon: 'cash-outline', color: '#8b5cf6' },
  { key: 'BILGI_VERILDI', label: 'Rutin / Bilgi', icon: 'information-circle-outline', color: '#0ea5e9' },
  { key: 'TAKIP_GEREK', label: 'Takip Gerekiyor', icon: 'time-outline', color: '#f59e0b' },
  { key: 'OLUMSUZ', label: 'Olumsuz', icon: 'close-circle-outline', color: '#ef4444' },
];

export const FieldVisitModal: React.FC<Props> = ({
  visible,
  visit,
  onClose,
  onVisitCompleted,
  onVisitCancelled,
}) => {
  const { theme } = useTheme();

  const [contactPerson, setContactPerson] = useState('');
  const [contactPersonTitle, setContactPersonTitle] = useState('');
  const [outcome, setOutcome] = useState<VisitOutcome>('BILGI_VERILDI');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && visit) {
      setContactPerson(visit.contactPerson || '');
      setContactPersonTitle(visit.contactPersonTitle || '');
      setOutcome(visit.outcome || 'BILGI_VERILDI');
      setNotes(visit.notes || '');
      setIsSubmitting(false);
    }
  }, [visible, visit]);

  if (!visit) return null;

  const startMs = new Date(visit.startTime).getTime();
  const diffMinutes = Math.max(1, Math.round((Date.now() - startMs) / 60000));

  const handleComplete = async () => {
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const updatedVisit: FieldVisitData = {
        ...visit,
        contactPerson: contactPerson.trim() || undefined,
        contactPersonTitle: contactPersonTitle.trim() || undefined,
        outcome,
        notes: notes.trim() || undefined,
      };

      const result = await completeFieldVisitSession(updatedVisit);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Ziyaret Tamamlandı',
        `"${visit.contactName}" ziyareti (${result.durationMinutes} dk) başarıyla CRM kayıtlarına işlendi.`
      );
      onVisitCompleted(result);
      onClose();
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Ziyaret kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      'Ziyareti İptal Et',
      'Bu saha ziyaret kaydını silmek istediğinize emin misiniz? Kayıt tutulmayacaktır.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, İptal Et',
          style: 'destructive',
          onPress: async () => {
            await cancelActiveVisitSession();
            onVisitCancelled();
            onClose();
          },
        },
      ]
    );
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
            <Text style={[styles.title, { color: theme.colors.text }]}>
              Saha Ziyaretini Tamamla
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              {visit.contactName}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Duration & GPS Badge Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
                <View>
                  <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>
                    Ziyaret Süresi
                  </Text>
                  <Text style={[styles.metricVal, { color: theme.colors.text }]}>
                    ~{diffMinutes} dakika
                  </Text>
                </View>
              </View>

              <View style={styles.metricItem}>
                <Ionicons name="location-outline" size={18} color="#10b981" />
                <View>
                  <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]}>
                    GPS Durumu
                  </Text>
                  <Text style={[styles.metricVal, { color: '#059669' }]}>
                    {visit.latitude && visit.longitude ? 'Konum Doğrulandı' : 'Konum Alındı'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Contact Person Details */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
              GÖRÜŞÜLEN YETKİLİ
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Adı ve Soyadı (Örn: Mehmet Bey)"
              placeholderTextColor={theme.colors.textMuted}
              value={contactPerson}
              onChangeText={setContactPerson}
            />

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  marginTop: 8,
                },
              ]}
              placeholder="Unvanı (Örn: Satın Alma Müdürü, Firma Sahibi)"
              placeholderTextColor={theme.colors.textMuted}
              value={contactPersonTitle}
              onChangeText={setContactPersonTitle}
            />
          </View>

          {/* Visit Outcome Options */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
              ZİYARET SONUCU
            </Text>

            <View style={styles.outcomesGrid}>
              {OUTCOME_OPTIONS.map((opt) => {
                const isSelected = outcome === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.outcomeChip,
                      {
                        backgroundColor: isSelected ? opt.color : theme.colors.surface,
                        borderColor: isSelected ? opt.color : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setOutcome(opt.key);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={15}
                      color={isSelected ? '#ffffff' : opt.color}
                    />
                    <Text
                      style={[
                        styles.outcomeText,
                        { color: isSelected ? '#ffffff' : theme.colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notes & Summary */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>
              GÖRÜŞME NOTLARI & DETAYLAR
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Görüşülen konular, müşteri talepleri, rakip fiyat bilgisi vb..."
              placeholderTextColor={theme.colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderTopColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]}
            onPress={handleCancel}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
            <Text style={styles.cancelBtnText}>İptal Et</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: '#16a34a' }]}
            onPress={handleComplete}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#ffffff" />
                <Text style={styles.saveBtnText}>Ziyareti Tamamla & Kaydet</Text>
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
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  outcomesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outcomeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
