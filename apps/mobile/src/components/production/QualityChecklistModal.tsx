import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { QCInspectionDTO, WorkOrder } from '../../services/production.service';
import { Badge } from '../common/Badge';

export interface QualityChecklistModalProps {
  visible: boolean;
  workOrder: WorkOrder | null;
  initialQC?: QCInspectionDTO | null;
  onClose: () => void;
  onApplyQC: (qc: QCInspectionDTO) => void;
}

const DEFECT_TYPES = [
  'Çapak / Fazlalık',
  'Yüzey Çiziği',
  'Gövde Çatlağı',
  'Boyut / Tolerans Sapması',
  'Boya / Kaplama Hatası',
  'Montaj / Fonksiyon Hatası',
  'Diğer',
];

export const QualityChecklistModal: React.FC<QualityChecklistModalProps> = ({
  visible,
  workOrder,
  initialQC,
  onClose,
  onApplyQC,
}) => {
  const { theme } = useTheme();

  // Visual Inspection Items
  const [visualSurface, setVisualSurface] = useState(true);
  const [visualNoBurr, setVisualNoBurr] = useState(true);
  const [visualNoScratch, setVisualNoScratch] = useState(true);

  // Dimension / Tolerance measurement
  const [dimensionTarget, setDimensionTarget] = useState('50.0');
  const [dimensionTolerance, setDimensionTolerance] = useState('0.2');
  const [dimensionMeasured, setDimensionMeasured] = useState('50.05');

  // Functional test
  const [functionalPassed, setFunctionalPassed] = useState(true);

  // Defect logging
  const [selectedDefect, setSelectedDefect] = useState<string>('');
  const [scrapQty, setScrapQty] = useState('0');
  const [notes, setNotes] = useState('');

  // Initialize / sync from initialQC when modal opens
  useEffect(() => {
    if (visible && initialQC) {
      setVisualSurface(!initialQC.visualDefects?.includes('Yüzey Kusuru'));
      setVisualNoBurr(!initialQC.visualDefects?.includes('Çapak/Pah Hatası'));
      setVisualNoScratch(!initialQC.visualDefects?.includes('Çizik/Leke'));
      if (initialQC.dimensionTarget !== undefined) setDimensionTarget(String(initialQC.dimensionTarget));
      if (initialQC.dimensionTolerance !== undefined) setDimensionTolerance(String(initialQC.dimensionTolerance));
      if (initialQC.dimensionMeasured !== undefined) setDimensionMeasured(String(initialQC.dimensionMeasured));
      setFunctionalPassed(initialQC.functionalPassed ?? true);
      setSelectedDefect(initialQC.defectType || '');
      setScrapQty(initialQC.scrapQty ? String(initialQC.scrapQty) : '0');
      setNotes(initialQC.notes || '');
    } else if (visible && !initialQC) {
      setVisualSurface(true);
      setVisualNoBurr(true);
      setVisualNoScratch(true);
      setDimensionTarget('50.0');
      setDimensionTolerance('0.2');
      setDimensionMeasured('50.05');
      setFunctionalPassed(true);
      setSelectedDefect('');
      setScrapQty('0');
      setNotes('');
    }
  }, [visible, initialQC]);

  // Calculate tolerance status
  const toleranceCalc = useMemo(() => {
    const target = parseFloat(dimensionTarget);
    const tol = parseFloat(dimensionTolerance);
    const measured = parseFloat(dimensionMeasured);

    if (isNaN(target) || isNaN(tol) || isNaN(measured) || tol <= 0) {
      return { isValid: false, inTolerance: true, diff: 0, min: 0, max: 0 };
    }

    const min = target - tol;
    const max = target + tol;
    const inTolerance = measured >= min && measured <= max;
    const diff = measured - target;

    return { isValid: true, inTolerance, diff, min, max };
  }, [dimensionTarget, dimensionTolerance, dimensionMeasured]);

  const allVisualPassed = visualSurface && visualNoBurr && visualNoScratch;
  const overallPassed = allVisualPassed && toleranceCalc.inTolerance && functionalPassed;

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const defects: string[] = [];
    if (!visualSurface) defects.push('Yüzey Kusuru');
    if (!visualNoBurr) defects.push('Çapak/Pah Hatası');
    if (!visualNoScratch) defects.push('Çizik/Leke');
    if (!toleranceCalc.inTolerance) defects.push('Ölçü Tolerans Dışı');
    if (!functionalPassed) defects.push('Fonksiyon Testi Başarısız');

    const numScrap = parseFloat(scrapQty);

    const qcResult: QCInspectionDTO = {
      visualPassed: allVisualPassed,
      visualDefects: defects,
      dimensionTarget: parseFloat(dimensionTarget) || undefined,
      dimensionMeasured: parseFloat(dimensionMeasured) || undefined,
      dimensionTolerance: parseFloat(dimensionTolerance) || undefined,
      dimensionPassed: toleranceCalc.inTolerance,
      functionalPassed,
      notes: notes.trim() || undefined,
      defectType: selectedDefect || (defects.length > 0 ? defects[0] : undefined),
      scrapQty: !isNaN(numScrap) && numScrap > 0 ? numScrap : undefined,
    };

    onApplyQC(qcResult);
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
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: overallPassed ? '#10b98120' : '#ef444420' },
              ]}
            >
              <Ionicons
                name={overallPassed ? 'shield-checkmark' : 'alert-circle'}
                size={22}
                color={overallPassed ? '#10b981' : '#ef4444'}
              />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Kalite Kontrol (QC) Formu
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {workOrder?.number || 'İş Emri'} • {workOrder?.product?.name || 'Ürün'}
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
          {/* Status Banner */}
          <View
            style={[
              styles.statusBanner,
              {
                backgroundColor: overallPassed ? '#10b98115' : '#ef444415',
                borderColor: overallPassed ? '#10b98140' : '#ef444440',
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Ionicons
              name={overallPassed ? 'checkmark-circle' : 'close-circle'}
              size={24}
              color={overallPassed ? '#10b981' : '#ef4444'}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.statusBannerTitle,
                  { color: overallPassed ? '#10b981' : '#ef4444' },
                ]}
              >
                {overallPassed ? 'Kalite Onayı Geçti (UYGUN)' : 'Kusurlu Parça / Tolerans Aşımı'}
              </Text>
              <Text style={[styles.statusBannerSub, { color: theme.colors.textMuted }]}>
                {overallPassed
                  ? 'Tüm görsel, ölçü ve fonksiyon testleri standartlara uygundur.'
                  : 'Parça hurdaya/fireye ayrılmalı veya revizyon işlemine alınmalıdır.'}
              </Text>
            </View>
          </View>

          {/* 1. Visual Inspection */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 16 }]}>
            1. Görsel Muayene Kontrolü
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <View style={styles.checkRow}>
              <View style={styles.checkInfo}>
                <Text style={[styles.checkLabel, { color: theme.colors.text }]}>
                  Yüzey Temizliği & Kusursuzluk
                </Text>
                <Text style={[styles.checkDesc, { color: theme.colors.textMuted }]}>
                  Gözenek, leke veya yabancı partikül yok
                </Text>
              </View>
              <Switch
                value={visualSurface}
                onValueChange={(val) => {
                  Haptics.selectionAsync().catch(() => {});
                  setVisualSurface(val);
                }}
                trackColor={{ false: '#ef444450', true: '#10b98170' }}
                thumbColor={visualSurface ? '#10b981' : '#ef4444'}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={styles.checkRow}>
              <View style={styles.checkInfo}>
                <Text style={[styles.checkLabel, { color: theme.colors.text }]}>
                  Çapak & Pah Kontrolü
                </Text>
                <Text style={[styles.checkDesc, { color: theme.colors.textMuted }]}>
                  Keskin kenar, çapak veya takım izi yok
                </Text>
              </View>
              <Switch
                value={visualNoBurr}
                onValueChange={(val) => {
                  Haptics.selectionAsync().catch(() => {});
                  setVisualNoBurr(val);
                }}
                trackColor={{ false: '#ef444450', true: '#10b98170' }}
                thumbColor={visualNoBurr ? '#10b981' : '#ef4444'}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: theme.colors.borderSubtle }]} />

            <View style={styles.checkRow}>
              <View style={styles.checkInfo}>
                <Text style={[styles.checkLabel, { color: theme.colors.text }]}>
                  Çizik & Deformasyon Kontrolü
                </Text>
                <Text style={[styles.checkDesc, { color: theme.colors.textMuted }]}>
                  Eğrilik, darbe izi veya çatlak yok
                </Text>
              </View>
              <Switch
                value={visualNoScratch}
                onValueChange={(val) => {
                  Haptics.selectionAsync().catch(() => {});
                  setVisualNoScratch(val);
                }}
                trackColor={{ false: '#ef444450', true: '#10b98170' }}
                thumbColor={visualNoScratch ? '#10b981' : '#ef4444'}
              />
            </View>
          </View>

          {/* 2. Dimension Measurement Check */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 18 }]}>
            2. Ölçüm & Tolerans Doğrulaması (Kumpas/Mikrometre)
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <View style={styles.dimensionInputsRow}>
              <View style={styles.dimInputCol}>
                <Text style={[styles.dimInputLabel, { color: theme.colors.textMuted }]}>
                  Nominal Hedef (mm)
                </Text>
                <TextInput
                  style={[
                    styles.dimInput,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.borderSubtle,
                      color: theme.colors.text,
                    },
                  ]}
                  value={dimensionTarget}
                  onChangeText={setDimensionTarget}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.dimInputCol}>
                <Text style={[styles.dimInputLabel, { color: theme.colors.textMuted }]}>
                  Tolerans (± mm)
                </Text>
                <TextInput
                  style={[
                    styles.dimInput,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.borderSubtle,
                      color: theme.colors.text,
                    },
                  ]}
                  value={dimensionTolerance}
                  onChangeText={setDimensionTolerance}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.dimInputCol}>
                <Text style={[styles.dimInputLabel, { color: theme.colors.primary, fontWeight: '700' }]}>
                  Ölçülen Değer (mm)
                </Text>
                <TextInput
                  style={[
                    styles.dimInput,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: toleranceCalc.inTolerance ? '#10b981' : '#ef4444',
                      color: theme.colors.text,
                      fontWeight: '700',
                    },
                  ]}
                  value={dimensionMeasured}
                  onChangeText={setDimensionMeasured}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.toleranceResultRow}>
              <Text style={[styles.toleranceRangeText, { color: theme.colors.textMuted }]}>
                {toleranceCalc.isValid
                  ? `Kabul Edilebilir Aralık: [${toleranceCalc.min.toFixed(2)} - ${toleranceCalc.max.toFixed(2)} mm]`
                  : 'Kabul Edilebilir Aralık: [Geçerli ölçüm giriniz]'}
              </Text>
              <Badge
                label={
                  !toleranceCalc.isValid
                    ? 'DEĞER BEKLENİYOR'
                    : toleranceCalc.inTolerance
                    ? `UYGUN (${toleranceCalc.diff >= 0 ? '+' : ''}${toleranceCalc.diff.toFixed(2)} mm)`
                    : `TOLERANS DIŞI (${toleranceCalc.diff >= 0 ? '+' : ''}${toleranceCalc.diff.toFixed(2)} mm)`
                }
                variant={!toleranceCalc.isValid ? 'neutral' : toleranceCalc.inTolerance ? 'success' : 'danger'}
                size="sm"
              />
            </View>
          </View>

          {/* 3. Functional Test */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 18 }]}>
            3. Fonksiyon & Çalışma Testi
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <View style={styles.checkRow}>
              <View style={styles.checkInfo}>
                <Text style={[styles.checkLabel, { color: theme.colors.text }]}>
                  Mekanik Hareket & Montaj Uyumu
                </Text>
                <Text style={[styles.checkDesc, { color: theme.colors.textMuted }]}>
                  Parça yatağına tam oturuyor, sıkışma veya boşluk yok
                </Text>
              </View>
              <Switch
                value={functionalPassed}
                onValueChange={(val) => {
                  Haptics.selectionAsync().catch(() => {});
                  setFunctionalPassed(val);
                }}
                trackColor={{ false: '#ef444450', true: '#10b98170' }}
                thumbColor={functionalPassed ? '#10b981' : '#ef4444'}
              />
            </View>
          </View>

          {/* 4. Defect Logging (if not passed) */}
          {!overallPassed && (
            <View style={{ marginTop: 18 }}>
              <Text style={[styles.sectionTitle, { color: '#ef4444' }]}>
                4. Hata Tipi & Hurda / Fire Kaydı
              </Text>
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.colors.surfaceCard,
                    borderColor: '#ef444440',
                    borderRadius: theme.borderRadius.md,
                  },
                ]}
              >
                <Text style={[styles.dimInputLabel, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                  Kusur / Hata Kategorisi
                </Text>
                <View style={styles.defectChipsRow}>
                  {DEFECT_TYPES.map((dt) => {
                    const isSel = selectedDefect === dt;
                    return (
                      <TouchableOpacity
                        key={dt}
                        style={[
                          styles.defectChip,
                          {
                            backgroundColor: isSel ? '#ef4444' : theme.colors.background,
                            borderColor: isSel ? '#ef4444' : theme.colors.borderSubtle,
                          },
                        ]}
                        onPress={() => setSelectedDefect(dt)}
                      >
                        <Text
                          style={[
                            styles.defectChipText,
                            { color: isSel ? '#ffffff' : theme.colors.text },
                          ]}
                        >
                          {dt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.dimInputLabel, { color: theme.colors.textMuted, marginBottom: 4 }]}>
                    Ayrılan Hurda / Fire Miktarı (Adet)
                  </Text>
                  <TextInput
                    style={[
                      styles.dimInput,
                      {
                        backgroundColor: theme.colors.background,
                        borderColor: theme.colors.borderSubtle,
                        color: theme.colors.text,
                      },
                    ]}
                    value={scrapQty}
                    onChangeText={setScrapQty}
                    keyboardType="numeric"
                    placeholder="1"
                  />
                </View>
              </View>
            </View>
          )}

          {/* Notes */}
          <Text style={[styles.sectionTitle, { color: theme.colors.text, marginTop: 18 }]}>
            QC Denetçi Notları
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
            placeholder="Kontrol tarihi, vardiya veya ölçüm alet seri no..."
            placeholderTextColor={theme.colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />
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
              Kapat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.confirmBtn,
              { backgroundColor: overallPassed ? '#10b981' : '#ef4444' },
            ]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Ionicons
              name={overallPassed ? 'shield-checkmark' : 'warning'}
              size={18}
              color="#ffffff"
            />
            <Text style={styles.confirmBtnText}>
              {overallPassed ? 'QC Onayını Kaydet' : 'Hatalı QC Kaydını Kaydet'}
            </Text>
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
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    padding: 14,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  checkInfo: {
    flex: 1,
    marginRight: 10,
  },
  checkLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  dimensionInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dimInputCol: {
    flex: 1,
  },
  dimInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  dimInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  toleranceResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f030',
  },
  toleranceRangeText: {
    fontSize: 11,
  },
  defectChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  defectChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  defectChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 60,
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
