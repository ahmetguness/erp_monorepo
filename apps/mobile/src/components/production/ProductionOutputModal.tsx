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
  WorkOrder,
  reportWorkOrderProduction,
} from '../../services/production.service';

export interface ProductionOutputModalProps {
  visible: boolean;
  workOrder: WorkOrder | null;
  onClose: () => void;
  onOutputReported: (workOrderId: string) => void;
}

const SCRAP_REASONS = [
  'Hammadde Bozukluğu',
  'Kalıp / Tezgah Ayar Hatası',
  'Ölçü Toleransı Dışı',
  'Yüzey / Boya Kusuru',
  'Elektrik / Kesinti Arızası',
  'Diğer',
];

export const ProductionOutputModal: React.FC<ProductionOutputModalProps> = ({
  visible,
  workOrder,
  onClose,
  onOutputReported,
}) => {
  const { theme } = useTheme();

  const [producedQty, setProducedQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');
  const [selectedScrapReason, setSelectedScrapReason] = useState<string>('');
  const [customScrapReason, setCustomScrapReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!workOrder) return null;

  const handleSubmit = async () => {
    const netQty = parseFloat(producedQty);
    if (isNaN(netQty) || netQty < 0) {
      Alert.alert('Geçersiz Miktar', 'Lütfen geçerli bir net üretim miktarı girin.');
      return;
    }

    const fireQty = parseFloat(scrapQty) || 0;
    const finalScrapReason =
      selectedScrapReason === 'Diğer'
        ? customScrapReason.trim()
        : selectedScrapReason || undefined;

    if (fireQty > 0 && !finalScrapReason) {
      Alert.alert('Fire Sebebi Eksik', 'Fire miktarı girildiğinde lütfen fire nedenini seçin veya belirtin.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSubmitting(true);
    try {
      await reportWorkOrderProduction(workOrder.id, {
        producedQty: netQty,
        scrapQty: fireQty,
        scrapReason: finalScrapReason,
        notes: notes.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onOutputReported(workOrder.id);
      onClose();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Hata', err?.response?.data?.message || 'Üretim bildirilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const plannedRemaining = Math.max(
    0,
    Number(workOrder.plannedQty) - Number(workOrder.producedQty || 0)
  );

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
              Üretim Bildirimi (Shop Floor)
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
              {workOrder.number} • {workOrder.product?.name || 'Ürün'}
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
          {/* Target Reference Card */}
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
            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={[styles.statSub, { color: theme.colors.textMuted }]}>PLANLANAN</Text>
                <Text style={[styles.statVal, { color: theme.colors.text }]}>
                  {workOrder.plannedQty} Adet
                </Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: theme.colors.borderSubtle }]} />

              <View style={styles.statCol}>
                <Text style={[styles.statSub, { color: theme.colors.textMuted }]}>ŞU ANA KADAR</Text>
                <Text style={[styles.statVal, { color: theme.colors.text }]}>
                  {workOrder.producedQty} Adet
                </Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: theme.colors.borderSubtle }]} />

              <View style={styles.statCol}>
                <Text style={[styles.statSub, { color: theme.colors.textMuted }]}>KALAN İHTİYAÇ</Text>
                <Text style={[styles.statVal, { color: theme.colors.primary }]}>
                  {plannedRemaining} Adet
                </Text>
              </View>
            </View>
          </View>

          {/* Form Quantities */}
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
                Net Üretilen Sağlam Miktar (Adet) *
              </Text>
              <TextInput
                style={[
                  styles.textInputMain,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: theme.colors.primary,
                  },
                ]}
                placeholder={String(plannedRemaining || 1)}
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                value={producedQty}
                onChangeText={setProducedQty}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                Fire / Iskarta Miktarı (Adet)
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
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                value={scrapQty}
                onChangeText={setScrapQty}
              />
            </View>

            {/* Scrap reason selection if scrap > 0 */}
            {parseFloat(scrapQty) > 0 && (
              <View style={styles.scrapSection}>
                <Text style={[styles.inputLabel, { color: theme.colors.danger }]}>
                  Fire / Iskarta Sebebi *
                </Text>
                <View style={styles.scrapChipsRow}>
                  {SCRAP_REASONS.map((r) => {
                    const isSelected = selectedScrapReason === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.scrapChip,
                          {
                            backgroundColor: isSelected
                              ? '#fee2e2'
                              : theme.colors.borderSubtle,
                            borderColor: isSelected ? '#ef4444' : theme.colors.border,
                          },
                        ]}
                        onPress={() => setSelectedScrapReason(r)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.scrapChipText,
                            { color: isSelected ? '#b91c1c' : theme.colors.textSecondary },
                          ]}
                        >
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedScrapReason === 'Diğer' && (
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: theme.colors.text,
                        backgroundColor: theme.colors.borderSubtle,
                        borderColor: theme.colors.border,
                        marginTop: 4,
                      },
                    ]}
                    placeholder="Fire nedenini açıklayın..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={customScrapReason}
                    onChangeText={setCustomScrapReason}
                  />
                )}
              </View>
            )}

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                Operatör Notları
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
                placeholder="Vardiya, tezgah durumu, kalite gözlemi..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>
        </ScrollView>

        {/* Footer CTA */}
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
                <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>Üretim Çıktısını Onayla & Kaydet</Text>
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
  },
  card: {
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statCol: {
    alignItems: 'center',
  },
  statSub: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInputMain: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    fontSize: 16,
    fontWeight: '700',
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
  },
  scrapSection: {
    gap: 6,
    paddingTop: 2,
  },
  scrapChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  scrapChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  scrapChipText: {
    fontSize: 11,
    fontWeight: '600',
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
