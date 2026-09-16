import React, { useState, useEffect } from 'react';
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
  WorkOrderItem,
  reportWorkOrderProduction,
  addWorkOrderItem,
  QCInspectionDTO,
  ProductionConsumptionItem,
} from '../../services/production.service';
import { QualityChecklistModal } from './QualityChecklistModal';
import { BarcodeScannerModal } from '../scanner/BarcodeScannerModal';
import { Badge } from '../common/Badge';

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

interface ConsumptionState {
  itemId: string;
  productName: string;
  productCode: string;
  requiredQty: number;
  consumedQty: number;
  lotNumber?: string;
  serialNumber?: string;
}

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

  // 16.1: BOM Material Consumptions State
  const [consumptions, setConsumptions] = useState<ConsumptionState[]>([]);
  const [lotNumber, setLotNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  // Scanner modal state
  const [scannerVisible, setScannerVisible] = useState(false);
  const [activeScanItemIndex, setActiveScanItemIndex] = useState<number | null>(null);

  // 16.1: Extra material inline form state
  const [showAddExtraModal, setShowAddExtraModal] = useState(false);
  const [extraProductId, setExtraProductId] = useState('');
  const [extraQty, setExtraQty] = useState('1');
  const [isAddingExtra, setIsAddingExtra] = useState(false);

  // 16.3: QC Checklist Modal State
  const [qcModalVisible, setQcModalVisible] = useState(false);
  const [qcInspection, setQcInspection] = useState<QCInspectionDTO | null>(null);

  // Initialize consumptions from workOrder.items
  useEffect(() => {
    if (workOrder && workOrder.items) {
      const items: ConsumptionState[] = workOrder.items.map((it) => {
        const req = Number(it.requiredQty);
        const cons = Number(it.consumedQty || 0);
        const remaining = Math.max(0, req - cons);
        return {
          itemId: it.id,
          productName: it.product?.name || 'Hammadde',
          productCode: it.product?.code || 'KOD',
          requiredQty: req,
          consumedQty: remaining,
          lotNumber: '',
          serialNumber: '',
        };
      });
      setConsumptions(items);
      setProducedQty(
        String(Math.max(1, Number(workOrder.plannedQty) - Number(workOrder.producedQty || 0)))
      );
    } else {
      setConsumptions([]);
      setProducedQty('');
    }
    setScrapQty('0');
    setSelectedScrapReason('');
    setCustomScrapReason('');
    setNotes('');
    setQcInspection(null);
    setLotNumber(`LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`);
  }, [workOrder, visible]);

  if (!workOrder) return null;

  const handleConsumptionChange = (index: number, val: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setConsumptions((prev) =>
      prev.map((c, idx) => (idx === index ? { ...c, consumedQty: Math.max(0, val) } : c))
    );
  };

  const handleLotChange = (index: number, lot: string) => {
    setConsumptions((prev) =>
      prev.map((c, idx) => (idx === index ? { ...c, lotNumber: lot } : c))
    );
  };

  const handleBarcodeScanned = (barcode: string) => {
    setScannerVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (activeScanItemIndex !== null) {
      handleLotChange(activeScanItemIndex, barcode);
      setActiveScanItemIndex(null);
    } else {
      setLotNumber(barcode);
    }
  };

  // Add extra material
  const handleAddExtraMaterial = async () => {
    if (!extraProductId.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen eklenecek ürün ID veya SKU girin.');
      return;
    }
    const q = parseFloat(extraQty);
    if (isNaN(q) || q <= 0) {
      Alert.alert('Geçersiz Miktar', 'Lütfen pozitif bir miktar girin.');
      return;
    }

    setIsAddingExtra(true);
    try {
      const createdItem = await addWorkOrderItem(workOrder.id, {
        productId: extraProductId.trim(),
        requiredQty: q,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConsumptions((prev) => [
        ...prev,
        {
          itemId: createdItem.id,
          productName: createdItem.product?.name || 'Ek Malzeme',
          productCode: createdItem.product?.code || extraProductId.trim(),
          requiredQty: q,
          consumedQty: q,
        },
      ]);
      setExtraProductId('');
      setExtraQty('1');
      setShowAddExtraModal(false);
      Alert.alert('Başarılı', 'Ek sarfiyat kalemi iş emrine başarıyla eklendi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.message || 'Ek malzeme eklenemedi.');
    } finally {
      setIsAddingExtra(false);
    }
  };

  // QC inspection completed callback
  const handleApplyQC = (qc: QCInspectionDTO) => {
    setQcInspection(qc);
    if (qc.scrapQty && qc.scrapQty > 0) {
      setScrapQty(String(qc.scrapQty));
      if (qc.defectType) {
        setSelectedScrapReason(qc.defectType);
      }
    }
    if (qc.notes) {
      setNotes((prev) => (prev ? `${prev} | QC: ${qc.notes}` : `QC: ${qc.notes}`));
    }
  };

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
      const consumptionPayload: ProductionConsumptionItem[] = consumptions.map((c) => ({
        itemId: c.itemId,
        quantity: c.consumedQty,
        lotNumber: c.lotNumber?.trim() || undefined,
        serialNumber: c.serialNumber?.trim() || undefined,
      }));

      await reportWorkOrderProduction(workOrder.id, {
        producedQty: netQty,
        scrapQty: fireQty,
        scrapReason: finalScrapReason,
        notes: notes.trim() || undefined,
        consumptions: consumptionPayload,
        lotNumber: lotNumber.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        qcInspection: qcInspection || undefined,
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
          <View style={styles.headerLeft}>
            <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="construct-outline" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Üretim & Sarfiyat Bildirimi
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                {workOrder.number} • {workOrder.product?.name || 'Ürün'}
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

          {/* 16.3: QC Checklist Banner / Trigger */}
          <TouchableOpacity
            style={[
              styles.qcBanner,
              {
                backgroundColor: qcInspection
                  ? qcInspection.visualPassed && qcInspection.dimensionPassed
                    ? '#10b98115'
                    : '#ef444415'
                  : theme.colors.surfaceCard,
                borderColor: qcInspection
                  ? qcInspection.visualPassed && qcInspection.dimensionPassed
                    ? '#10b981'
                    : '#ef4444'
                  : theme.colors.primary,
                borderRadius: theme.borderRadius.md,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setQcModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.qcBannerLeft}>
              <Ionicons
                name={
                  qcInspection
                    ? qcInspection.visualPassed && qcInspection.dimensionPassed
                      ? 'shield-checkmark'
                      : 'alert-circle'
                    : 'clipboard-outline'
                }
                size={22}
                color={
                  qcInspection
                    ? qcInspection.visualPassed && qcInspection.dimensionPassed
                      ? '#10b981'
                      : '#ef4444'
                    : theme.colors.primary
                }
              />
              <View>
                <Text style={[styles.qcBannerTitle, { color: theme.colors.text }]}>
                  Kalite Kontrol (QC) Kontrol Listesi
                </Text>
                <Text style={[styles.qcBannerSub, { color: theme.colors.textMuted }]}>
                  {qcInspection
                    ? qcInspection.visualPassed && qcInspection.dimensionPassed
                      ? '✓ Görsel ve ölçü testleri geçti (UYGUN)'
                      : `⚠ Kusur tespit edildi: ${qcInspection.defectType || 'Hatalı'} (${qcInspection.scrapQty || 0} fire)`
                    : 'Görsel kusur, tolerans ölçümü ve fonksiyon kontrolü yapın'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>

          {/* Produced Quantity Input */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.colors.text }]}>
                Sağlam Üretilen Net Miktar (Adet) *
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
                keyboardType="numeric"
                placeholder="Örn: 10"
                placeholderTextColor={theme.colors.textMuted}
                value={producedQty}
                onChangeText={setProducedQty}
              />
            </View>

            {/* Finished Product Lot & Serial Numbers */}
            <View style={styles.lotRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.subLabel, { color: theme.colors.textMuted }]}>
                  Üretilen Parti / Lot No
                </Text>
                <View style={styles.lotInputWrap}>
                  <TextInput
                    style={[
                      styles.textInputSm,
                      {
                        color: theme.colors.text,
                        backgroundColor: theme.colors.borderSubtle,
                        borderColor: theme.colors.border,
                      },
                    ]}
                    placeholder="LOT-202609..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={lotNumber}
                    onChangeText={setLotNumber}
                  />
                  <TouchableOpacity
                    style={styles.scanMiniBtn}
                    onPress={() => {
                      setActiveScanItemIndex(null);
                      setScannerVisible(true);
                    }}
                  >
                    <Ionicons name="barcode-outline" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.subLabel, { color: theme.colors.textMuted }]}>
                  Seri No (Opsiyonel)
                </Text>
                <TextInput
                  style={[
                    styles.textInputSm,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.borderSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  placeholder="SN-XXXX"
                  placeholderTextColor={theme.colors.textMuted}
                  value={serialNumber}
                  onChangeText={setSerialNumber}
                />
              </View>
            </View>
          </View>

          {/* 16.1: Reçete (BOM) Malzeme Sarfiyatı & Lot Düşümü */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <View style={styles.bomHeaderRow}>
              <View>
                <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
                  Reçete (BOM) Sarfiyatı & Lot Düşümü
                </Text>
                <Text style={[styles.sectionSubHeading, { color: theme.colors.textMuted }]}>
                  Kullanılan hammadde ve partileri doğrulayın
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.addExtraBtn, { backgroundColor: theme.colors.primaryMuted }]}
                onPress={() => setShowAddExtraModal(true)}
              >
                <Ionicons name="add" size={16} color={theme.colors.primary} />
                <Text style={[styles.addExtraBtnText, { color: theme.colors.primary }]}>
                  Ek Sarf
                </Text>
              </TouchableOpacity>
            </View>

            {consumptions.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                Bu iş emrine atanmış reçete malzemesi bulunmuyor.
              </Text>
            ) : (
              consumptions.map((item, idx) => (
                <View
                  key={item.itemId}
                  style={[
                    styles.bomItemCard,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.borderSubtle,
                      borderRadius: theme.borderRadius.md,
                    },
                  ]}
                >
                  <View style={styles.bomItemTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bomItemName, { color: theme.colors.text }]}>
                        {item.productName}
                      </Text>
                      <Text style={[styles.bomItemCode, { color: theme.colors.textMuted }]}>
                        SKU: {item.productCode} • Gerekli: {item.requiredQty} Adet
                      </Text>
                    </View>

                    {/* Consumed Stepper */}
                    <View style={styles.stepperWrap}>
                      <TouchableOpacity
                        style={[styles.stepBtn, { backgroundColor: theme.colors.borderSubtle }]}
                        onPress={() => handleConsumptionChange(idx, item.consumedQty - 1)}
                      >
                        <Ionicons name="remove" size={16} color={theme.colors.text} />
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.stepInput, { color: theme.colors.text }]}
                        keyboardType="numeric"
                        value={String(item.consumedQty)}
                        onChangeText={(v) => handleConsumptionChange(idx, parseFloat(v) || 0)}
                      />
                      <TouchableOpacity
                        style={[styles.stepBtn, { backgroundColor: theme.colors.borderSubtle }]}
                        onPress={() => handleConsumptionChange(idx, item.consumedQty + 1)}
                      >
                        <Ionicons name="add" size={16} color={theme.colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Item Lot input with camera scanner */}
                  <View style={styles.itemLotRow}>
                    <Text style={[styles.lotHint, { color: theme.colors.textMuted }]}>
                      Lot/Parti:
                    </Text>
                    <TextInput
                      style={[
                        styles.itemLotInput,
                        {
                          backgroundColor: theme.colors.surfaceCard,
                          borderColor: theme.colors.borderSubtle,
                          color: theme.colors.text,
                        },
                      ]}
                      placeholder="Parti No okutun veya yazın..."
                      placeholderTextColor={theme.colors.textMuted}
                      value={item.lotNumber}
                      onChangeText={(txt) => handleLotChange(idx, txt)}
                    />
                    <TouchableOpacity
                      style={[styles.scanBtn, { backgroundColor: theme.colors.primaryMuted }]}
                      onPress={() => {
                        setActiveScanItemIndex(idx);
                        setScannerVisible(true);
                      }}
                    >
                      <Ionicons name="camera-outline" size={16} color={theme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Scrap Section */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: '#ef4444' }]}>
                Fire / Hurda Miktarı (Adet)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: '#ef4444',
                    backgroundColor: theme.colors.borderSubtle,
                    borderColor: '#ef444450',
                  },
                ]}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                value={scrapQty}
                onChangeText={setScrapQty}
              />
            </View>

            {parseFloat(scrapQty) > 0 && (
              <View style={styles.scrapSection}>
                <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
                  Fire Sebebi Seçin *
                </Text>
                <View style={styles.scrapChipsRow}>
                  {SCRAP_REASONS.map((reason) => {
                    const isSelected = selectedScrapReason === reason;
                    return (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.scrapChip,
                          {
                            backgroundColor: isSelected
                              ? '#ef4444'
                              : theme.colors.borderSubtle,
                            borderColor: isSelected
                              ? '#ef4444'
                              : theme.colors.border,
                          },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setSelectedScrapReason(reason);
                        }}
                      >
                        <Text
                          style={[
                            styles.scrapChipText,
                            { color: isSelected ? '#ffffff' : theme.colors.text },
                          ]}
                        >
                          {reason}
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
                        marginTop: 6,
                      },
                    ]}
                    placeholder="Özel fire sebebi belirtin..."
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
                Üretim Notu / Vardiya Açıklaması
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
                placeholder="Vardiya, tezgah durumu, operatör notu..."
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

        {/* 16.3: QC Checklist Modal */}
        <QualityChecklistModal
          visible={qcModalVisible}
          workOrder={workOrder}
          initialQC={qcInspection}
          onClose={() => setQcModalVisible(false)}
          onApplyQC={handleApplyQC}
        />

        {/* Camera Barcode Scanner for Lot/Parti */}
        <BarcodeScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onBarcodeScanned={handleBarcodeScanned}
        />

        {/* 16.1: Extra Material Addition Dialog */}
        <Modal
          visible={showAddExtraModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddExtraModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.extraModalCard,
                { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle },
              ]}
            >
              <Text style={[styles.extraModalTitle, { color: theme.colors.text }]}>
                Reçete Dışı Ek Malzeme Ekle
              </Text>
              <Text style={[styles.extraModalSub, { color: theme.colors.textMuted }]}>
                İş emrine fazladan sarf edilecek hammadde/parça
              </Text>

              <Text style={[styles.inputLabel, { color: theme.colors.textMuted, marginTop: 12 }]}>
                Ürün ID veya SKU Kodu
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.borderSubtle },
                ]}
                placeholder="Örn: HAM-0042 veya ürün ID"
                placeholderTextColor={theme.colors.textMuted}
                value={extraProductId}
                onChangeText={setExtraProductId}
              />

              <Text style={[styles.inputLabel, { color: theme.colors.textMuted, marginTop: 10 }]}>
                Miktar (Adet)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.borderSubtle },
                ]}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor={theme.colors.textMuted}
                value={extraQty}
                onChangeText={setExtraQty}
              />

              <View style={styles.extraModalActions}>
                <TouchableOpacity
                  style={[styles.extraCancelBtn, { borderColor: theme.colors.borderSubtle }]}
                  onPress={() => setShowAddExtraModal(false)}
                >
                  <Text style={[styles.extraBtnText, { color: theme.colors.textMuted }]}>İptal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.extraConfirmBtn, { backgroundColor: theme.colors.primary }]}
                  disabled={isAddingExtra}
                  onPress={handleAddExtraMaterial}
                >
                  {isAddingExtra ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.extraConfirmBtnText}>Ekle & Sarf Et</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  qcBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    padding: 12,
  },
  qcBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  qcBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  qcBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
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
  textInputSm: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 12,
  },
  lotRow: {
    flexDirection: 'row',
    gap: 10,
  },
  lotInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scanMiniBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionSubHeading: {
    fontSize: 11,
    marginTop: 2,
  },
  addExtraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addExtraBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  bomItemCard: {
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  bomItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bomItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  bomItemCode: {
    fontSize: 11,
    marginTop: 2,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInput: {
    width: 44,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  itemLotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lotHint: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemLotInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
  },
  scanBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  extraModalCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  extraModalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  extraModalSub: {
    fontSize: 12,
    marginTop: 2,
  },
  extraModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  extraCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  extraConfirmBtn: {
    flex: 1.5,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraConfirmBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
