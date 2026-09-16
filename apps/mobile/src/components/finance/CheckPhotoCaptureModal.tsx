import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export interface CheckPhotoCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onSavePhotos: (photos: { frontUri?: string; backUri?: string }) => void;
  initialFrontUri?: string;
  initialBackUri?: string;
}

export const CheckPhotoCaptureModal: React.FC<CheckPhotoCaptureModalProps> = ({
  visible,
  onClose,
  onSavePhotos,
  initialFrontUri,
  initialBackUri,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [activeSide, setActiveSide] = useState<'FRONT' | 'BACK'>('FRONT');
  const [frontUri, setFrontUri] = useState<string | undefined>(initialFrontUri);
  const [backUri, setBackUri] = useState<string | undefined>(initialBackUri);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Sync initial values when modal opens
  React.useEffect(() => {
    if (visible) {
      setFrontUri(initialFrontUri);
      setBackUri(initialBackUri);
      setActiveSide('FRONT');
    }
  }, [visible, initialFrontUri, initialBackUri]);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (photo?.uri) {
        if (activeSide === 'FRONT') {
          setFrontUri(photo.uri);
          // Automatically prompt or switch to BACK side for smooth flow
          setActiveSide('BACK');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          setBackUri(photo.uri);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[CheckPhotoCapture] Capture error:', err);
      Alert.alert('Hata', 'Fotoğraf çekilirken bir sorun oluştu.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSavePhotos({ frontUri, backUri });
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        {!permission?.granted ? (
          <SafeAreaView style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={64} color="#ffffff" />
            <Text style={styles.permissionTitle}>Kamera İzni Gerekiyor</Text>
            <Text style={styles.permissionText}>
              Çekin ön ve arka yüzünü kaydedebilmek için kameraya erişim izni vermeniz gerekmektedir.
            </Text>
            <TouchableOpacity style={styles.grantBtn} onPress={requestPermission} activeOpacity={0.8}>
              <Text style={styles.grantBtnText}>İzin Ver</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Vazgeç</Text>
            </TouchableOpacity>
          </SafeAreaView>
        ) : (
          <View style={StyleSheet.absoluteFillObject}>
            <CameraView
              ref={(ref) => {
                cameraRef.current = ref;
              }}
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={isTorchOn}
            />

            {/* Dark Mask & Guide Box */}
            <SafeAreaView style={styles.overlay}>
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
                  <Ionicons name="close" size={24} color="#ffffff" />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                  <Text style={styles.headerTitle}>Çek Fotoğrafı Çek</Text>
                  <Text style={styles.headerSubtitle}>
                    {activeSide === 'FRONT' ? '1/2: Çekin ÖN Yüzünü Hizalayın' : '2/2: Çekin ARKA Yüzünü Hizalayın'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.iconBtn, isTorchOn && { backgroundColor: '#f59e0b' }]}
                  onPress={() => setIsTorchOn((prev) => !prev)}
                >
                  <Ionicons name={isTorchOn ? 'flash' : 'flash-outline'} size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Check Guide Framing Area */}
              <View style={styles.guideWrapper}>
                <View style={styles.guideFrame}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />

                  <Text style={styles.guideHint}>
                    {activeSide === 'FRONT'
                      ? 'Çek yaprağının tamamını çerçeve içine sığdırın'
                      : 'Arka yüzdeki ciro ve kaşeleri çerçeve içine sığdırın'}
                  </Text>
                </View>
              </View>

              {/* Side Selection Tabs & Captured Thumbnails */}
              <View style={styles.sideSelector}>
                <TouchableOpacity
                  style={[styles.sideTab, activeSide === 'FRONT' && styles.sideTabActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setActiveSide('FRONT');
                  }}
                  activeOpacity={0.8}
                >
                  {frontUri ? (
                    <Image source={{ uri: frontUri }} style={styles.sideThumb} />
                  ) : (
                    <Ionicons name="card-outline" size={16} color={activeSide === 'FRONT' ? '#2563eb' : '#94a3b8'} />
                  )}
                  <Text style={[styles.sideTabText, activeSide === 'FRONT' && styles.sideTabTextActive]}>
                    Ön Yüz {frontUri ? '✓' : ''}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sideTab, activeSide === 'BACK' && styles.sideTabActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setActiveSide('BACK');
                  }}
                  activeOpacity={0.8}
                >
                  {backUri ? (
                    <Image source={{ uri: backUri }} style={styles.sideThumb} />
                  ) : (
                    <Ionicons name="barcode-outline" size={16} color={activeSide === 'BACK' ? '#2563eb' : '#94a3b8'} />
                  )}
                  <Text style={[styles.sideTabText, activeSide === 'BACK' && styles.sideTabTextActive]}>
                    Arka Yüz {backUri ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Bottom Shutter & Controls */}
              <View style={styles.controlsBar}>
                <View style={{ width: 60 }} />

                {/* Shutter Button */}
                <TouchableOpacity
                  style={styles.shutterButton}
                  onPress={handleCapture}
                  disabled={isCapturing}
                  activeOpacity={0.7}
                >
                  <View style={styles.shutterInner}>
                    {isCapturing ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Ionicons name="camera" size={28} color="#2563eb" />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Complete Button */}
                <View style={{ width: 60, alignItems: 'flex-end' }}>
                  {(frontUri || backUri) && (
                    <TouchableOpacity style={styles.doneBtn} onPress={handleSave} activeOpacity={0.8}>
                      <Ionicons name="checkmark" size={20} color="#ffffff" />
                      <Text style={styles.doneBtnText}>Kaydet</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </SafeAreaView>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  grantBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#93c5fd',
    fontSize: 12,
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  guideFrame: {
    width: '100%',
    aspectRatio: 2.1, // Bank check standard aspect ratio
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#38bdf8',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  guideHint: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    textAlign: 'center',
  },
  sideSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 16,
  },
  sideTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  sideTabActive: {
    backgroundColor: '#ffffff',
    borderColor: '#2563eb',
  },
  sideTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  sideTabTextActive: {
    color: '#1e293b',
  },
  sideThumb: {
    width: 22,
    height: 16,
    borderRadius: 2,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
