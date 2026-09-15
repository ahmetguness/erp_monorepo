import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';

export interface BarcodeManualInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (barcode: string) => void;
  title?: string;
  placeholder?: string;
}

export const BarcodeManualInputModal: React.FC<BarcodeManualInputModalProps> = ({
  visible,
  onClose,
  onSubmit,
  title = 'Manuel Barkod Girişi',
  placeholder = 'Barkod no veya ürün kodu girin...',
}) => {
  const { theme } = useTheme();
  const [code, setCode] = useState('');

  const handleSubmit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSubmit(trimmed);
    setCode('');
    onClose();
  };

  const handleClose = () => {
    setCode('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />

        <View
          style={[
            styles.dialog,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderRadius: theme.borderRadius.xl,
              ...theme.shadows.lg,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: theme.colors.primaryMuted },
              ]}
            >
              <Ionicons name="keypad-outline" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {title}
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                Kamera okumuyorsa veya barkod silikse kodu elle girin
              </Text>
            </View>
          </View>

          {/* Input Box */}
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.colors.borderSubtle,
                borderColor: theme.colors.border,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Ionicons name="barcode-outline" size={20} color={theme.colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textMuted}
              value={code}
              onChangeText={setCode}
              autoFocus
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            {code.length > 0 && (
              <TouchableOpacity onPress={() => setCode('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleClose}
              style={[
                styles.btn,
                styles.cancelBtn,
                {
                  backgroundColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <Text style={[styles.btnText, { color: theme.colors.textSecondary }]}>
                Vazgeç
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSubmit}
              disabled={!code.trim()}
              style={[
                styles.btn,
                styles.submitBtn,
                {
                  backgroundColor: code.trim() ? theme.colors.primary : theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <Ionicons
                name="checkmark"
                size={18}
                color={code.trim() ? '#ffffff' : theme.colors.textMuted}
              />
              <Text
                style={[
                  styles.btnText,
                  { color: code.trim() ? '#ffffff' : theme.colors.textMuted },
                ]}
              >
                Giriş Yap
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    padding: 0,
  },
  clearBtn: {
    padding: 2,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  cancelBtn: {},
  submitBtn: {},
  btnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
