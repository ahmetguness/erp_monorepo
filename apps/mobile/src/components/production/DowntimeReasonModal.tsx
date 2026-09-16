import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/redux';
import {
  startDowntime,
  selectShopFloorTimer,
} from '../../store/redux/shopFloorTimerSlice';

export interface DowntimeReasonModalProps {
  visible: boolean;
  onClose: () => void;
}

interface DowntimeOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
}

const DOWNTIME_OPTIONS: DowntimeOption[] = [
  {
    id: 'Mekanik Arıza',
    label: 'Mekanik Arıza',
    icon: 'construct-outline',
    color: '#ef4444',
    description: 'Tezgâh mekanik aksamında sıkışma veya kırılma',
  },
  {
    id: 'Elektrik Kesintisi',
    label: 'Elektrik Kesintisi',
    icon: 'flash-outline',
    color: '#f59e0b',
    description: 'Şebeke veya pano kaynaklı güç kesintisi',
  },
  {
    id: 'Kalıp Değişimi',
    label: 'Kalıp / Takım Değişimi',
    icon: 'sync-outline',
    color: '#3b82f6',
    description: 'Yeni ürün ayarı veya takım yenileme',
  },
  {
    id: 'Hammadde Yok',
    label: 'Hammadde / Malzeme Yok',
    icon: 'cube-outline',
    color: '#8b5cf6',
    description: 'Depodan besleme veya parça tedariği bekleniyor',
  },
  {
    id: 'Yemek / Mola',
    label: 'Yemek / Çay Molası',
    icon: 'cafe-outline',
    color: '#10b981',
    description: 'Vardiya dinlenme ve mola periyodu',
  },
  {
    id: 'Bakım & Onarım',
    label: 'Bakım & Onarım',
    icon: 'hammer-outline',
    color: '#ec4899',
    description: 'Planlı bakım veya sensör kalibrasyonu',
  },
];

export const DowntimeReasonModal: React.FC<DowntimeReasonModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();
  const timer = useAppSelector(selectShopFloorTimer);

  const [selectedReason, setSelectedReason] = useState<string>('Mekanik Arıza');
  const [note, setNote] = useState('');

  const handleStartDowntime = () => {
    if (!timer.isRunning) {
      Alert.alert('Uyarı', 'Duruş kaydı başlatabilmek için önce aktif bir iş emri sayacı çalışıyor olmalıdır.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    dispatch(
      startDowntime({
        reason: selectedReason,
        note: note.trim() || undefined,
      })
    );
    setNote('');
    onClose();
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
          <View style={styles.headerLeft}>
            <View style={[styles.iconBadge, { backgroundColor: '#ef444422' }]}>
              <Ionicons name="pause-circle" size={22} color="#ef4444" />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Tezgâh Duruşuna Geç
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {timer.workOrderNumber || 'İş Emri'} • Duruş Nedeni Belirleyin
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Duruş Nedeni Seçin
          </Text>

          <View style={styles.reasonsGrid}>
            {DOWNTIME_OPTIONS.map((opt) => {
              const isSelected = selectedReason === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.reasonCard,
                    {
                      backgroundColor: isSelected
                        ? opt.color + '15'
                        : theme.colors.surfaceCard,
                      borderColor: isSelected ? opt.color : theme.colors.borderSubtle,
                      borderRadius: theme.borderRadius.md,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedReason(opt.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.reasonTop}>
                    <View
                      style={[
                        styles.reasonIconBox,
                        { backgroundColor: opt.color + '25' },
                      ]}
                    >
                      <Ionicons name={opt.icon} size={20} color={opt.color} />
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={opt.color} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.reasonLabel,
                      { color: theme.colors.text, fontWeight: isSelected ? '700' : '600' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text
                    style={[styles.reasonDesc, { color: theme.colors.textMuted }]}
                    numberOfLines={2}
                  >
                    {opt.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Optional Note */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 18 }]}>
            Açıklama / Not (Opsiyonel)
          </Text>
          <TextInput
            style={[
              styles.notesInput,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                color: theme.colors.text,
                borderRadius: theme.borderRadius.md,
              },
            ]}
            placeholder="Örn: 2 numaralı rulman aşırı ısındı, teknisyen bekleniyor..."
            placeholderTextColor={theme.colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
          />

          <View
            style={[
              styles.warningBox,
              {
                backgroundColor: '#ef444415',
                borderColor: '#ef444440',
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Ionicons name="information-circle-outline" size={18} color="#ef4444" />
            <Text style={[styles.warningText, { color: '#ef4444' }]}>
              Duruş başladığında ana iş emri süresi durdurulur ve duruş sayacı ayrı olarak OEE
              verimlilik raporuna işlenir.
            </Text>
          </View>
        </ScrollView>

        {/* Footer */}
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
            style={[styles.cancelBtn, { borderColor: theme.colors.borderSubtle }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelBtnText, { color: theme.colors.textMuted }]}>
              Vazgeç
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: '#ef4444' }]}
            onPress={handleStartDowntime}
            activeOpacity={0.8}
          >
            <Ionicons name="pause" size={18} color="#ffffff" />
            <Text style={styles.confirmBtnText}>Duruşu Başlat</Text>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  reasonsGrid: {
    gap: 10,
  },
  reasonCard: {
    borderWidth: 1.5,
    padding: 12,
  },
  reasonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  reasonIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonLabel: {
    fontSize: 14,
    marginBottom: 3,
  },
  reasonDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  notesInput: {
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    padding: 12,
    marginTop: 18,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
