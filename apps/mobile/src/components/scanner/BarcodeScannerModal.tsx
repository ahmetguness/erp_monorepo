import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/redux';
import {
  toggleContinuousScan,
  toggleTorch,
  undoLastScan,
  selectWarehouseSession,
} from '../../store/redux/warehouseSessionSlice';
import { BarcodeManualInputModal } from './BarcodeManualInputModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = Math.min(SCREEN_WIDTH * 0.75, 280);

export interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
  title?: string;
  subtitle?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  visible,
  onClose,
  onBarcodeScanned,
  title = 'Barkod / QR Tara',
  subtitle = 'Kamerayı barkod veya QR koda hizalayın',
}) => {
  const { theme } = useTheme();
  const dispatch = useAppDispatch();
  const { isContinuousScan, isTorchOn, scanBuffer, lastScannedBarcode, duplicateScanWarning } =
    useAppSelector(selectWarehouseSession);

  const [permission, requestPermission] = useCameraPermissions();
  const [manualInputVisible, setManualInputVisible] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [scanPulse, setScanPulse] = useState(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Laser animation line
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: SCAN_AREA_SIZE - 8,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [visible, scanAnim]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  const handleBarcodeScan = useCallback(
    (result: BarcodeScanningResult) => {
      const data = result.data?.trim();
      if (!data) return;

      // Throttle scanning to avoid flood
      if (scanCooldown) return;

      setScanCooldown(true);
      setScanPulse(true);
      setTimeout(() => setScanPulse(false), 150);

      cooldownTimerRef.current = setTimeout(() => {
        setScanCooldown(false);
      }, isContinuousScan ? 1200 : 800);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onBarcodeScanned(data);

      if (!isContinuousScan) {
        onClose();
      }
    },
    [scanCooldown, isContinuousScan, onBarcodeScanned, onClose]
  );

  const handleManualSubmit = (barcode: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onBarcodeScanned(barcode);
    if (!isContinuousScan) {
      onClose();
    }
  };

  const handleUndo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    dispatch(undoLastScan());
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.container}>
        {/* Permission Denied View */}
        {!permission?.granted ? (
          <SafeAreaView style={styles.permissionContainer} edges={['top', 'bottom']}>
            <View style={styles.permissionContent}>
              <View style={[styles.permissionIcon, { backgroundColor: theme.colors.primaryMuted }]}>
                <Ionicons name="camera-outline" size={48} color={theme.colors.primary} />
              </View>
              <Text style={styles.permissionTitle}>Kamera İzni Gerekli</Text>
              <Text style={styles.permissionDesc}>
                Barkod ve QR kodları otomatik okuyabilmek için kameranıza erişim izni vermeniz
                gerekmektedir.
              </Text>

              <TouchableOpacity
                style={[styles.grantBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => requestPermission()}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color="#ffffff" />
                <Text style={styles.grantBtnText}>İzin Ver</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.manualAltBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() => setManualInputVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="keypad-outline" size={18} color="#ffffff" />
                <Text style={styles.manualAltBtnText}>Manuel Kod Gir</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeAltBtn} onPress={onClose}>
                <Text style={styles.closeAltBtnText}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        ) : (
          /* Active Camera View */
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={isTorchOn}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr',
                  'ean13',
                  'code128',
                  'code39',
                  'upc_a',
                  'ean8',
                  'pdf417',
                  'itf14',
                ],
              }}
              onBarcodeScanned={handleBarcodeScan}
            />

            {/* Dark Mask Around Scanning Reticle */}
            <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
              {/* Top Controls Bar */}
              <View style={styles.topBar}>
                <TouchableOpacity
                  style={styles.iconCircle}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>

                <View style={styles.headerInfo}>
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>

                {/* Torch Toggle */}
                <TouchableOpacity
                  style={[
                    styles.iconCircle,
                    isTorchOn && { backgroundColor: theme.colors.warning },
                  ]}
                  onPress={() => dispatch(toggleTorch())}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isTorchOn ? 'flash' : 'flash-off'}
                    size={20}
                    color={isTorchOn ? '#000000' : '#ffffff'}
                  />
                </TouchableOpacity>
              </View>

              {/* Mode Toggle Bar: Single vs Continuous */}
              <View style={styles.modeBarWrapper}>
                <TouchableOpacity
                  style={[
                    styles.modeChip,
                    !isContinuousScan && styles.modeChipActive,
                  ]}
                  onPress={() => dispatch(toggleContinuousScan())}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="scan-outline"
                    size={14}
                    color={!isContinuousScan ? '#ffffff' : '#94a3b8'}
                  />
                  <Text
                    style={[
                      styles.modeChipText,
                      !isContinuousScan && styles.modeChipTextActive,
                    ]}
                  >
                    Tekli Okuma
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeChip,
                    isContinuousScan && styles.modeChipActive,
                  ]}
                  onPress={() => dispatch(toggleContinuousScan())}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="infinite-outline"
                    size={14}
                    color={isContinuousScan ? '#ffffff' : '#94a3b8'}
                  />
                  <Text
                    style={[
                      styles.modeChipText,
                      isContinuousScan && styles.modeChipTextActive,
                    ]}
                  >
                    Seri Okuma (Sürekli)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Central Reticle Vizör */}
              <View style={styles.reticleContainer}>
                {(() => {
                  const activeBorderColor = scanPulse
                    ? theme.colors.emeraldNeon
                    : duplicateScanWarning
                    ? theme.colors.crimsonLaser
                    : theme.colors.primary;
                  return (
                    <View style={styles.reticle}>
                      {/* Corner Marks */}
                      <View style={[styles.corner, styles.topLeft, { borderColor: activeBorderColor }]} />
                      <View style={[styles.corner, styles.topRight, { borderColor: activeBorderColor }]} />
                      <View style={[styles.corner, styles.bottomLeft, { borderColor: activeBorderColor }]} />
                      <View style={[styles.corner, styles.bottomRight, { borderColor: activeBorderColor }]} />

                      {/* Animated Laser Line */}
                      <Animated.View
                        style={[
                          styles.laserLine,
                          {
                            backgroundColor: scanPulse
                              ? theme.colors.emeraldNeon
                              : duplicateScanWarning
                              ? theme.colors.crimsonLaser
                              : theme.colors.primary,
                            shadowColor: scanPulse ? theme.colors.emeraldNeon : theme.colors.primary,
                            shadowOpacity: 0.9,
                            shadowRadius: 8,
                            elevation: 6,
                            transform: [{ translateY: scanAnim }],
                          },
                        ]}
                      />
                    </View>
                  );
                })()}

                {duplicateScanWarning && (
                  <View style={styles.duplicateWarningBanner}>
                    <Ionicons name="warning" size={14} color="#ffffff" />
                    <Text style={styles.duplicateWarningText}>
                      Aynı barkod az önce okutuldu!
                    </Text>
                  </View>
                )}
              </View>

              {/* Bottom Quick Bar & Scan Buffer Indicator */}
              <View style={styles.bottomBar}>
                {/* Last Scanned Banner */}
                {lastScannedBarcode && (
                  <View style={styles.lastScannedCard}>
                    <View style={styles.lastScannedLeft}>
                      <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                      <View>
                        <Text style={styles.lastScannedLabel}>Son Okutulan ({scanBuffer.length})</Text>
                        <Text style={styles.lastScannedCode} numberOfLines={1}>
                          {lastScannedBarcode}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.undoBtn}
                      onPress={handleUndo}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-undo-outline" size={16} color="#ffffff" />
                      <Text style={styles.undoBtnText}>Geri Al</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Bottom Action Buttons */}
                <View style={styles.bottomButtonsRow}>
                  <TouchableOpacity
                    style={styles.manualBtn}
                    onPress={() => setManualInputVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="keypad-outline" size={18} color="#ffffff" />
                    <Text style={styles.manualBtnText}>Manuel Kod Gir</Text>
                  </TouchableOpacity>

                  {isContinuousScan && scanBuffer.length > 0 && (
                    <TouchableOpacity
                      style={[styles.doneBtn, { backgroundColor: theme.colors.success }]}
                      onPress={onClose}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="checkmark-done" size={18} color="#ffffff" />
                      <Text style={styles.doneBtnText}>Tamamla ({scanBuffer.length})</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </SafeAreaView>
          </View>
        )}

        {/* Manual Keyboard Modal */}
        <BarcodeManualInputModal
          visible={manualInputVisible}
          onClose={() => setManualInputVisible(false)}
          onSubmit={handleManualSubmit}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraWrapper: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
  },
  modeBarWrapper: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    padding: 3,
    marginTop: 8,
    gap: 4,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modeChipActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  modeChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  modeChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  reticleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  reticle: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#ffffff',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  laserLine: {
    width: '100%',
    height: 2,
    shadowColor: '#10b981',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  duplicateWarningBanner: {
    position: 'absolute',
    bottom: -36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  duplicateWarningText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 12 : 20,
    gap: 12,
  },
  lastScannedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  lastScannedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  lastScannedLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
  },
  lastScannedCode: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  undoBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  manualBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  manualBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  doneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionContent: {
    alignItems: 'center',
    maxWidth: 340,
  },
  permissionIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  manualAltBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  manualAltBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  closeAltBtn: {
    paddingVertical: 10,
  },
  closeAltBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
});
