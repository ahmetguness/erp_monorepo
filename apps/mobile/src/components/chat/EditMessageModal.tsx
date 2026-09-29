import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '../../design-system/hooks/useTheme';

interface EditMessageModalProps {
  visible: boolean;
  initialContent: string;
  onClose: () => void;
  onSave: (newContent: string) => void;
}

export const EditMessageModal: React.FC<EditMessageModalProps> = ({
  visible,
  initialContent,
  onClose,
  onSave,
}) => {
  const { theme, isDark } = useTheme();
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    if (visible) {
      setContent(initialContent);
    }
  }, [visible, initialContent]);

  const handleSave = () => {
    const trimmed = content.trim();
    if (trimmed) {
      onSave(trimmed);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceCard,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            Mesajı Düzenle
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                borderColor: theme.colors.borderSubtle,
                color: theme.colors.textPrimary,
              },
            ]}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus
            selectTextOnFocus
            maxLength={10000}
            placeholder="Mesajınızı girin..."
            placeholderTextColor={theme.colors.textMuted}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>
                Vazgeç
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                {
                  backgroundColor: content.trim() ? theme.colors.primary : theme.colors.borderSubtle,
                },
              ]}
              disabled={!content.trim()}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>Kaydet</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    minHeight: 80,
    maxHeight: 180,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
