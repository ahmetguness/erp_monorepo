import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  thermalPrinterService,
  PrinterSettings,
  PrinterDevice,
  PaperWidth,
  generatePaymentReceipt,
  generateProductLabel,
  generateShelfLabel,
} from '../../services/thermal-printer.service';
import { Badge } from '../common/Badge';

export interface PrinterSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme } = useTheme();

  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Fiş Önizleme');
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSettings();
      scanDevices();
    } else {
      setPreviewText(null);
    }
  }, [visible]);

  const loadSettings = async () => {
    const s = await thermalPrinterService.getSettings();
    setSettings(s);
  };

  const scanDevices = async () => {
    setIsScanning(true);
    try {
      const list = await thermalPrinterService.discoverDevices();
      setDevices(list);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectPaperWidth = async (width: PaperWidth) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const updated = await thermalPrinterService.updateSettings({ paperWidth: width });
    setSettings(updated);
  };

  const handlePairDevice = async (device: PrinterDevice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await thermalPrinterService.pairDevice(device);
    await loadSettings();
    await scanDevices();
    Alert.alert('Cihaz Eşleşti', `"${device.name}" aktif termal yazıcı olarak belirlendi.`);
  };

  const handleDisconnectDevice = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await thermalPrinterService.disconnectDevice();
    await loadSettings();
    await scanDevices();
  };

  // Test Receipt Print
  const handlePrintTestReceipt = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsPrinting(true);
    try {
      const { preview, bytes } = generatePaymentReceipt(
        {
          receiptNumber: 'TAH-2026-00042',
          contactName: 'Örnek Ticaret Ltd. Şti.',
          date: new Date().toLocaleDateString('tr-TR'),
          amount: 4500,
          paymentMethod: 'Kredi Kartı / POS',
          remainingBalance: 1250,
          notes: 'Test Tahsilat Baskısı',
        },
        'AXON ERP TEST BİLGİ FİŞİ',
        settings?.paperWidth || 58
      );

      setPreviewTitle('Test Tahsilat Makbuzu (ESC/POS)');
      setPreviewText(preview);

      const res = await thermalPrinterService.print(bytes, 'Test Makbuzu');
      if (!res.success) {
        Alert.alert('Bilgi', res.message);
      }
    } finally {
      setIsPrinting(false);
    }
  };

  // Test Label Print
  const handlePrintTestLabel = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsPrinting(true);
    try {
      const { preview, bytes } = generateShelfLabel(
        {
          warehouseName: 'Merkez Ana Depo',
          code: 'A-01-03',
          name: 'Hızlı Toplama Koridoru / Raf 3',
          aisle: 'A',
          shelf: '3',
        },
        settings?.paperWidth || 58
      );

      setPreviewTitle('Test Raf Etiketi (ESC/POS)');
      setPreviewText(preview);

      const res = await thermalPrinterService.print(bytes, 'Test Raf Etiketi');
      if (!res.success) {
        Alert.alert('Bilgi', res.message);
      }
    } finally {
      setIsPrinting(false);
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
          <View style={styles.headerLeft}>
            <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryMuted }]}>
              <Ionicons name="print-outline" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
                Bluetooth Termal Yazıcı
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
                ESC/POS Fiş & Etiket Ayarları
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

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Active Paired Device Status Card */}
          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: settings?.pairedDevice ? theme.colors.success : theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
                ...theme.shadows.sm,
              },
            ]}
          >
            <View style={styles.statusHeaderRow}>
              <View style={styles.statusLeftCol}>
                <Text style={[styles.statusLabel, { color: theme.colors.textMuted }]}>
                  AKTİF YAZICI DURUMU
                </Text>
                <Text style={[styles.statusDeviceName, { color: theme.colors.text }]}>
                  {settings?.pairedDevice?.name || 'Eşleşmiş Cihaz Yok'}
                </Text>
                {settings?.pairedDevice?.address && (
                  <Text style={[styles.statusDeviceAddress, { color: theme.colors.textMuted }]}>
                    MAC: {settings.pairedDevice.address}
                  </Text>
                )}
              </View>

              <Badge
                label={settings?.pairedDevice ? 'BAĞLI' : 'BAĞLI DEĞİL'}
                variant={settings?.pairedDevice ? 'success' : 'neutral'}
                size="md"
              />
            </View>

            {settings?.pairedDevice && (
              <TouchableOpacity
                style={[styles.disconnectBtn, { backgroundColor: theme.colors.borderSubtle }]}
                onPress={handleDisconnectDevice}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle-outline" size={16} color={theme.colors.danger} />
                <Text style={[styles.disconnectBtnText, { color: theme.colors.danger }]}>
                  Eşleşmeyi Kaldır
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Paper Width Selection */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Kağıt Genişliği (ESC/POS Formatı)
            </Text>
            <Text style={[styles.sectionDesc, { color: theme.colors.textMuted }]}>
              Yazıcınızın rulo genişliğini seçin. Karakter hizalaması bu değere göre ayarlanır.
            </Text>

            <View style={styles.paperWidthButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.paperWidthBtn,
                  settings?.paperWidth === 58
                    ? [styles.paperWidthBtnActive, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]
                    : { backgroundColor: theme.colors.borderSubtle, borderColor: 'transparent' },
                ]}
                onPress={() => handleSelectPaperWidth(58)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="receipt-outline"
                  size={24}
                  color={settings?.paperWidth === 58 ? '#ffffff' : theme.colors.text}
                />
                <Text
                  style={[
                    styles.paperWidthBtnTitle,
                    { color: settings?.paperWidth === 58 ? '#ffffff' : theme.colors.text },
                  ]}
                >
                  58 mm
                </Text>
                <Text
                  style={[
                    styles.paperWidthBtnSubtitle,
                    { color: settings?.paperWidth === 58 ? '#ffffff' : theme.colors.textMuted },
                  ]}
                >
                  Taşınabilir Mini / Kemer (32 Karakter)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paperWidthBtn,
                  settings?.paperWidth === 80
                    ? [styles.paperWidthBtnActive, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]
                    : { backgroundColor: theme.colors.borderSubtle, borderColor: 'transparent' },
                ]}
                onPress={() => handleSelectPaperWidth(80)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="newspaper-outline"
                  size={24}
                  color={settings?.paperWidth === 80 ? '#ffffff' : theme.colors.text}
                />
                <Text
                  style={[
                    styles.paperWidthBtnTitle,
                    { color: settings?.paperWidth === 80 ? '#ffffff' : theme.colors.text },
                  ]}
                >
                  80 mm
                </Text>
                <Text
                  style={[
                    styles.paperWidthBtnSubtitle,
                    { color: settings?.paperWidth === 80 ? '#ffffff' : theme.colors.textMuted },
                  ]}
                >
                  Masaüstü / Standart (48 Karakter)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Test Printing Quick Action Buttons */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Hızlı Baskı & Şablon Testi
            </Text>

            <View style={styles.testButtonsRow}>
              <TouchableOpacity
                style={[styles.testActionBtn, { backgroundColor: theme.colors.primaryMuted }]}
                onPress={handlePrintTestReceipt}
                disabled={isPrinting}
                activeOpacity={0.8}
              >
                <Ionicons name="receipt" size={20} color={theme.colors.primary} />
                <Text style={[styles.testActionText, { color: theme.colors.primary }]}>
                  Test Fişi Yazdır
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.testActionBtn, { backgroundColor: theme.colors.primaryMuted }]}
                onPress={handlePrintTestLabel}
                disabled={isPrinting}
                activeOpacity={0.8}
              >
                <Ionicons name="barcode" size={20} color={theme.colors.primary} />
                <Text style={[styles.testActionText, { color: theme.colors.primary }]}>
                  Test Etiket Yazdır
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Live Thermal Paper Monospace Preview */}
          {previewText && (
            <View
              style={[
                styles.previewContainer,
                {
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.lg,
                },
              ]}
            >
              <View style={styles.previewHeaderRow}>
                <View style={styles.previewHeaderLeft}>
                  <Ionicons name="eye-outline" size={16} color={theme.colors.primary} />
                  <Text style={[styles.previewHeaderTitle, { color: theme.colors.text }]}>
                    {previewTitle}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setPreviewText(null)}>
                  <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Thermal Paper Monospaced Roll Simulation */}
              <View style={styles.thermalPaper}>
                <Text style={styles.thermalPaperText}>{previewText}</Text>
              </View>
            </View>
          )}

          {/* Nearby Bluetooth Printers List */}
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
          >
            <View style={styles.deviceListHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Yakındaki Bluetooth Yazıcılar
              </Text>
              <TouchableOpacity
                style={[styles.refreshBtn, { backgroundColor: theme.colors.borderSubtle }]}
                onPress={scanDevices}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="refresh" size={16} color={theme.colors.text} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.devicesList}>
              {devices.map((device) => {
                const isCurrent = settings?.pairedDevice?.id === device.id;
                return (
                  <View
                    key={device.id}
                    style={[
                      styles.deviceRow,
                      {
                        borderColor: isCurrent ? theme.colors.primary : theme.colors.borderSubtle,
                        backgroundColor: isCurrent ? theme.colors.primaryMuted : theme.colors.background,
                      },
                    ]}
                  >
                    <View style={styles.deviceInfoCol}>
                      <View style={styles.deviceNameRow}>
                        <Ionicons
                          name="bluetooth"
                          size={18}
                          color={isCurrent ? theme.colors.primary : theme.colors.textMuted}
                        />
                        <Text style={[styles.deviceNameText, { color: theme.colors.text }]}>
                          {device.name}
                        </Text>
                      </View>
                      {device.address && (
                        <Text style={[styles.deviceAddressText, { color: theme.colors.textMuted }]}>
                          {device.address} {device.type === 'SIMULATOR' ? '• Simülatör' : ''}
                        </Text>
                      )}
                    </View>

                    {isCurrent ? (
                      <Badge label="SEÇİLİ" variant="success" size="sm" />
                    ) : (
                      <TouchableOpacity
                        style={[styles.pairBtn, { backgroundColor: theme.colors.primary }]}
                        onPress={() => handlePairDevice(device)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pairBtnText}>Eşleştir</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, gap: 14 },
  statusCard: { padding: 16, borderWidth: 1.5, gap: 12 },
  statusHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLeftCol: { gap: 3 },
  statusLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  statusDeviceName: { fontSize: 16, fontWeight: '800' },
  statusDeviceAddress: { fontSize: 11 },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disconnectBtnText: { fontSize: 13, fontWeight: '600' },
  sectionCard: { padding: 16, borderWidth: 1, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionDesc: { fontSize: 12, lineHeight: 16 },
  paperWidthButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  paperWidthBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
  },
  paperWidthBtnActive: {},
  paperWidthBtnTitle: { fontSize: 16, fontWeight: '800' },
  paperWidthBtnSubtitle: { fontSize: 10, textAlign: 'center', lineHeight: 13 },
  testButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  testActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  testActionText: { fontSize: 13, fontWeight: '700' },
  previewContainer: {
    borderWidth: 1,
    padding: 14,
    backgroundColor: '#f8fafc',
    gap: 10,
  },
  previewHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewHeaderTitle: { fontSize: 13, fontWeight: '700' },
  thermalPaper: {
    backgroundColor: '#fffdfa',
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  thermalPaperText: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    color: '#1e293b',
  },
  deviceListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devicesList: { gap: 8, marginTop: 4 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  deviceInfoCol: { gap: 2, flex: 1 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deviceNameText: { fontSize: 14, fontWeight: '700' },
  deviceAddressText: { fontSize: 11, marginLeft: 24 },
  pairBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pairBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
});
