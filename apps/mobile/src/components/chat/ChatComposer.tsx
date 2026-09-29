import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ChatMessage } from '@repo/types/chat';
import { useTheme } from '../../design-system/hooks/useTheme';

interface ChatComposerProps {
  replyMessage: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (content: string, replyToMessageId?: string) => Promise<void>;
  isSending?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  replyMessage,
  onCancelReply,
  onSend,
  isSending = false,
}) => {
  const { theme, isDark } = useTheme();
  const [text, setText] = useState('');

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setText('');
    await onSend(trimmed, replyMessage?.id);
    if (replyMessage) {
      onCancelReply();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface0,
          borderTopColor: theme.colors.borderSubtle,
        },
      ]}
    >
      {/* Reply Banner */}
      {replyMessage && (
        <View
          style={[
            styles.replyBanner,
            {
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
              borderLeftColor: theme.colors.primary,
            },
          ]}
        >
          <View style={styles.replyTextWrap}>
            <Text style={[styles.replySender, { color: theme.colors.primary }]}>
              {replyMessage.sender.name} kullanıcısına yanıt veriliyor
            </Text>
            <Text
              style={[styles.replySnippet, { color: theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              {replyMessage.content || '📎 Ek veya medya'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cancelReplyBtn}
            onPress={onCancelReply}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input Row */}
      <View style={styles.inputRow}>
        <View
          style={[
            styles.inputWrap,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
              borderColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <TextInput
            style={[styles.input, { color: theme.colors.textPrimary }]}
            placeholder="Mesajınızı yazın..."
            placeholderTextColor={theme.colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={5000}
            returnKeyType={Platform.OS === 'ios' ? 'default' : 'none'}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.sendBtn,
            {
              backgroundColor: text.trim().length > 0 && !isSending
                ? theme.colors.primary
                : isDark
                ? 'rgba(255, 255, 255, 0.1)'
                : '#E2E8F0',
            },
          ]}
          disabled={!text.trim() || isSending}
          onPress={handleSend}
          activeOpacity={0.8}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons
              name="send"
              size={17}
              color={text.trim().length > 0 ? '#FFFFFF' : theme.colors.textMuted}
              style={{ marginLeft: 2 }}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  replyTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  replySender: {
    fontSize: 12,
    fontWeight: '700',
  },
  replySnippet: {
    fontSize: 12,
  },
  cancelReplyBtn: {
    padding: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    minHeight: 40,
    maxHeight: 120,
  },
  input: {
    fontSize: 15,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
