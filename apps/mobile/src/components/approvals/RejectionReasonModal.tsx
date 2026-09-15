import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { ApprovalRequest } from '../../services/approval.service';

export interface RejectionReasonModalProps {
  visible: boolean;
  request: ApprovalRequest | null;
  isActing?: boolean;
  onClose: () => void;
  onConfirm: (requestId: string, reason: string) => void;
}

export const RejectionReasonModal: React.FC<RejectionReasonModalProps> = ({
  visible,
  request,
  isActing = false,
  onClose,
  onConfirm,
}) => {
  const { theme } = useTheme();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) {
      setReason('');
    }
  }, [visible]);

  const handleConfirm = () => {
    if (!reason.trim() || !request || isActing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onConfirm(request.id, reason.trim());
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  if (!request) return null;

  const isButtonDisabled = !reason.trim() || isActing;

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
          <View style={styles.dialogHeader}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: theme.colors.dangerMuted },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={24} color={theme.colors.danger} />
            </View>
            <View style={styles.headerTitles}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Talebi Reddet
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                {request.flow?.name || 'Talep'} • {request.requestedBy || 'Personel'}
              </Text>
            </View>
          </View>

          {/* Prompt */}
          <Text style={[styles.promptText, { color: theme.colors.textSecondary }]}>
            Bu onay talebini reddetmek için bir gerekçe belirtmeniz gerekmektedir:
          </Text>

          {/* Reason Input */}
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.borderSubtle,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                borderRadius: theme.borderRadius.md,
              },
            ]}
            placeholder="Reddetme nedenini yazınız (örn: Bütçe aşımı, eksik evrak)..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
            numberOfLines={4}
            value={reason}
            onChangeText={setReason}
            autoFocus
          />

          {/* Actions */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleClose}
              disabled={isActing}
              style={[
                styles.button,
                styles.cancelButton,
                {
                  backgroundColor: theme.colors.borderSubtle,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>
                Vazgeç
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleConfirm}
              disabled={isButtonDisabled}
              style={[
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: isButtonDisabled
                    ? theme.colors.borderSubtle
                    : theme.colors.danger,
                  borderRadius: theme.borderRadius.md,
                },
              ]}
            >
              {isActing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text
                  style={[
                    styles.confirmText,
                    {
                      color: isButtonDisabled
                        ? theme.colors.textMuted
                        : '#ffffff',
                    },
                  ]}
                >
                  Reddi Onayla
                </Text>
              )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    zIndex: 1,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  promptText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {},
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {},
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
