import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  PanResponder,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import {
  FieldServiceJob,
  createFieldCheckpoint,
} from '../../services/field-service.service';

export interface SignatureCaptureModalProps {
  visible: boolean;
  job: FieldServiceJob | null;
  onClose: () => void;
  onSignatureSaved: (jobId: string, signatureSvgPaths?: string[]) => void;
}

export const SignatureCaptureModal: React.FC<SignatureCaptureModalProps> = ({
  visible,
  job,
  onClose,
  onSignatureSaved,
}) => {
  const { theme } = useTheme();

  const [customerName, setCustomerName] = useState(job?.contact?.name || '');
  const [completedPaths, setCompletedPaths] = useState<string[]>([]);
  const [currentStroke, setCurrentStroke] = useState<string>('');
  const currentPathRef = useRef<string>('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // PanResponder to track touch points
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const startPoint = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        currentPathRef.current = startPoint;
        setCurrentStroke(startPoint);
        setIsDrawing(true);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPathRef.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setCurrentStroke(currentPathRef.current);
      },
      onPanResponderRelease: () => {
        if (currentPathRef.current) {
          const finalStroke = currentPathRef.current;
          setCompletedPaths((prev) => [...prev, finalStroke]);
          currentPathRef.current = '';
          setCurrentStroke('');
        }
        setIsDrawing(false);
      },
    })
  ).current;

  if (!job) return null;

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCompletedPaths([]);
    setCurrentStroke('');
    currentPathRef.current = '';
  };

  const handleSaveSignature = async () => {
    if (!customerName.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen teslim alan müşteri / yetkili adını girin.');
      return;
    }

    const totalStrokes = completedPaths.length + (currentStroke ? 1 : 0);
    if (totalStrokes === 0) {
      Alert.alert('İmza Eksik', 'Lütfen ekrana parmağınızla imza atın.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsSubmitting(true);
    try {
      await createFieldCheckpoint(job.id, 'CUSTOMER_APPROVAL', {
        customerName: customerName.trim(),
        note: `Müşteri dijital imzası alındı (${totalStrokes} çizgi)`,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSignatureSaved(job.id, completedPaths);
      onClose();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Hata', err?.response?.data?.message || 'İmza kaydedilemedi.');
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
              Müşteri Teslim & Onay İmzası
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
          {/* Customer name input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>
              Teslim Alan Yetkili / Müşteri Adı *
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
              placeholder="Ad Soyad..."
              placeholderTextColor={theme.colors.textMuted}
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          {/* Canvas header with Clear button */}
          <View style={styles.canvasHeader}>
            <Text style={[styles.canvasLabel, { color: theme.colors.text }]}>
              İmza Alanı (Parmağınızla çizin)
            </Text>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={14} color={theme.colors.danger} />
              <Text style={[styles.clearBtnText, { color: theme.colors.danger }]}>
                Temizle
              </Text>
            </TouchableOpacity>
          </View>

          {/* Native SVG Touch Canvas */}
          <View
            style={[
              styles.canvasContainer,
              {
                backgroundColor: '#ffffff',
                borderColor: theme.colors.border,
                borderRadius: theme.borderRadius.lg,
              },
            ]}
            {...panResponder.panHandlers}
          >
            <Svg style={StyleSheet.absoluteFill}>
              {completedPaths.map((p, idx) => (
                <Path
                  key={`c-${idx}`}
                  d={p}
                  stroke="#0f172a"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
              {Boolean(currentStroke) && (
                <Path
                  d={currentStroke}
                  stroke="#0f172a"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              )}
            </Svg>

            {completedPaths.length === 0 && !currentStroke && !isDrawing && (
              <View style={styles.placeholderOverlay} pointerEvents="none">
                <Ionicons name="pencil" size={32} color="#94a3b8" />
                <Text style={styles.placeholderText}>
                  Lütfen bu alana parmağınızla imza atın
                </Text>
              </View>
            )}

            {/* Signature line indicator */}
            <View style={styles.signatureBaseline} pointerEvents="none" />
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
            onPress={handleSaveSignature}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-done-circle" size={20} color="#ffffff" />
                <Text style={styles.saveBtnText}>İmzayı Onayla & Kaydet</Text>
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
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    fontSize: 14,
  },
  canvasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  canvasLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  canvasContainer: {
    flex: 1,
    minHeight: 250,
    borderWidth: 2,
    borderStyle: 'dashed',
    position: 'relative',
    overflow: 'hidden',
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  signatureBaseline: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: '#cbd5e1',
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
