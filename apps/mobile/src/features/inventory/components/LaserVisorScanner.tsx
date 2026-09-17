// apps/mobile/src/features/inventory/components/LaserVisorScanner.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme';
import { TabularText } from '../../../design-system/primitives/TabularText';
import { Badge } from '../../../components/common/Badge';

const SCREEN_WIDTH = typeof Dimensions?.get === 'function' ? Dimensions.get('window')?.width || 390 : 390;
const VISOR_SIZE = Math.min(SCREEN_WIDTH * 0.76, 300);

export interface LaserVisorScannerProps {
  onBarcodeScanned: (barcode: string) => void;
  onManualInputPress?: () => void;
  isTorchOn?: boolean;
  onToggleTorch?: () => void;
  isContinuous?: boolean;
  onToggleContinuous?: () => void;
  lastBarcode?: string | null;
  scanCount?: number;
}

export const LaserVisorScanner: React.FC<LaserVisorScannerProps> = ({
  onBarcodeScanned,
  onManualInputPress,
  isTorchOn = false,
  onToggleTorch,
  isContinuous = false,
  onToggleContinuous,
  lastBarcode,
  scanCount = 0,
}) => {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [isSuccessPulse, setIsSuccessPulse] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  // Laser beam oscillation animation
  const laserAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: VISOR_SIZE - 6,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [laserAnim]);

  const handleBarcodeScan = useCallback(
    (result: BarcodeScanningResult) => {
      const data = result.data?.trim();
      if (!data || cooldown) return;

      setCooldown(true);
      setTimeout(() => setCooldown(false), isContinuous ? 1200 : 800);

      // Trigger 150ms Emerald Neon pulse and Success Haptic
      setIsSuccessPulse(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 75,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 75,
          useNativeDriver: false,
        }),
      ]).start(() => {
        setIsSuccessPulse(false);
      });

      onBarcodeScanned(data);
    },
    [cooldown, isContinuous, onBarcodeScanned, pulseAnim]
  );

  if (!permission) {
    return (
      <View style={[styles.centerBox, { backgroundColor: theme.colors.canvas }]}>
        <Text style={[styles.permText, { color: theme.colors.textSecondary }]}>
          Kamera başlatılıyor...
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centerBox, { backgroundColor: theme.colors.canvas }]}>
        <Ionicons name="camera-outline" size={48} color={theme.colors.textMuted} />
        <Text style={[styles.permText, { color: theme.colors.textPrimary }]}>
          Kamera İzni Gerekli
        </Text>
        <Text style={[styles.permSub, { color: theme.colors.textMuted }]}>
          Barkod ve QR kod okuyabilmek için kamera erişimine izin verin.
        </Text>
        <TouchableOpacity
          style={[styles.permBtn, { backgroundColor: theme.colors.primary }]}
          onPress={requestPermission}
        >
          <Text style={styles.permBtnText}>İzin Ver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const visorBorderColor = isSuccessPulse
    ? theme.colors.emeraldNeon
    : theme.colors.crimsonLaser;

  return (
    <View style={styles.container}>
      {/* Camera Live Feed */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={isTorchOn}
        barcodeScannerSettings={{
          barcodeTypes: [
            'qr',
            'ean13',
            'ean8',
            'code128',
            'code39',
            'upc_a',
            'upc_e',
            'itf14',
            'datamatrix',
          ],
        }}
        onBarcodeScanned={handleBarcodeScan}
      />

      {/* Dark Translucent Mask Surroundings */}
      <View style={styles.maskTop} />
      <View style={styles.maskMiddleRow}>
        <View style={styles.maskSide} />

        {/* ── CENTRAL LASER VISOR ── */}
        <View style={[styles.visorBox, { width: VISOR_SIZE, height: VISOR_SIZE }]}>
          {/* Target Reticle Corners */}
          <View
            style={[
              styles.cornerTopLeft,
              { borderColor: visorBorderColor },
            ]}
          />
          <View
            style={[
              styles.cornerTopRight,
              { borderColor: visorBorderColor },
            ]}
          />
          <View
            style={[
              styles.cornerBottomLeft,
              { borderColor: visorBorderColor },
            ]}
          />
          <View
            style={[
              styles.cornerBottomRight,
              { borderColor: visorBorderColor },
            ]}
          />

          {/* Center Crosshair Submark */}
          <View style={styles.crosshairCenter}>
            <View
              style={[
                styles.crosshairH,
                { backgroundColor: isSuccessPulse ? theme.colors.emeraldNeon : 'rgba(255, 255, 255, 0.4)' },
              ]}
            />
            <View
              style={[
                styles.crosshairV,
                { backgroundColor: isSuccessPulse ? theme.colors.emeraldNeon : 'rgba(255, 255, 255, 0.4)' },
              ]}
            />
          </View>

          {/* Oscillating Neon Laser Beam */}
          <Animated.View
            style={[
              styles.laserBeam,
              {
                backgroundColor: isSuccessPulse
                  ? theme.colors.emeraldNeon
                  : theme.colors.crimsonLaser,
                shadowColor: isSuccessPulse
                  ? theme.colors.emeraldNeon
                  : theme.colors.crimsonLaser,
                transform: [{ translateY: laserAnim }],
              },
            ]}
          />
        </View>

        <View style={styles.maskSide} />
      </View>
      <View style={styles.maskBottom}>
        {/* HUD Info & Controls */}
        <View style={styles.hudContainer}>
          {/* Last Scanned Code Banner */}
          {lastBarcode ? (
            <View
              style={[
                styles.lastScannedBadge,
                {
                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                  borderColor: theme.colors.emeraldNeon,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.emeraldNeon} />
              <TabularText style={[styles.lastBarcodeText, { color: '#FFFFFF' }]}>
                {lastBarcode}
              </TabularText>
              {scanCount > 0 && (
                <Badge label={`${scanCount} adet`} variant="success" size="sm" />
              )}
            </View>
          ) : (
            <Text style={styles.instructionText}>
              Barkod veya QR kodu lazer çizgisine hizalayın
            </Text>
          )}

          {/* Quick HUD Buttons */}
          <View style={styles.controlsRow}>
            {onToggleTorch && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onToggleTorch();
                }}
                style={[
                  styles.hudBtn,
                  isTorchOn && { backgroundColor: theme.colors.primary },
                ]}
              >
                <Ionicons
                  name={isTorchOn ? 'flash' : 'flash-outline'}
                  size={20}
                  color={isTorchOn ? '#FFFFFF' : '#E2E8F0'}
                />
              </TouchableOpacity>
            )}

            {onToggleContinuous && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onToggleContinuous();
                }}
                style={[
                  styles.hudBtn,
                  isContinuous && { backgroundColor: theme.colors.primary },
                ]}
              >
                <Ionicons
                  name={isContinuous ? 'repeat' : 'repeat-outline'}
                  size={20}
                  color={isContinuous ? '#FFFFFF' : '#E2E8F0'}
                />
              </TouchableOpacity>
            )}

            {onManualInputPress && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onManualInputPress();
                }}
                style={styles.hudBtn}
              >
                <Ionicons name="keypad-outline" size={20} color="#E2E8F0" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  permText: {
    fontSize: 16,
    fontWeight: '700',
  },
  permSub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
  permBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  maskTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  maskMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  maskSide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    height: VISOR_SIZE,
  },
  visorBox: {
    position: 'relative',
    overflow: 'hidden',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  crosshairCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 20,
    height: 20,
    marginLeft: -10,
    marginTop: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 14,
    borderRadius: 1,
  },
  laserBeam: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  maskBottom: {
    flex: 1.2,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  hudContainer: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  lastScannedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  lastBarcodeText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  instructionText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  hudBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
