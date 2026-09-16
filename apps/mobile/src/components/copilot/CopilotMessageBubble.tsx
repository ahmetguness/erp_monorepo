import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CopilotMarkdownText } from './CopilotMarkdownText';
import { CopilotActionPill } from './CopilotActionPill';
import { ActionableEntity } from '../../services/chat.service';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  usedData?: boolean;
  suggestions?: string[];
  actionEntities?: ActionableEntity[];
  error?: boolean;
}

interface CopilotMessageBubbleProps {
  message: CopilotMessage;
  onSelectSuggestion?: (suggestion: string) => void;
  onNavigateAction?: (entity: ActionableEntity) => void;
}

export const CopilotMessageBubble: React.FC<CopilotMessageBubbleProps> = ({
  message,
  onSelectSuggestion,
  onNavigateAction,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCopied(true);
      await Share.share({ message: message.content });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const formattedTime = message.timestamp.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {/* Bot Avatar */}
      {!isUser && (
        <View style={[styles.avatarBot, message.error && styles.avatarError]}>
          <Ionicons
            name={message.error ? 'alert-circle' : 'sparkles'}
            size={14}
            color={message.error ? '#EF4444' : '#38BDF8'}
          />
        </View>
      )}

      {/* Bubble Container */}
      <View
        style={[
          styles.bubble,
          isUser
            ? styles.bubbleUser
            : message.error
            ? styles.bubbleError
            : styles.bubbleBot,
        ]}
      >
        {/* Markdown Content */}
        <CopilotMarkdownText content={message.content} isUser={isUser} />

        {/* Actionable Entity Buttons */}
        {message.actionEntities && message.actionEntities.length > 0 && onNavigateAction && (
          <View style={styles.actionContainer}>
            <View style={styles.actionHeader}>
              <Ionicons name="link-outline" size={12} color="#38BDF8" />
              <Text style={styles.actionHeaderText}>İŞLEM KISAYOLLARI</Text>
            </View>
            {message.actionEntities.map((entity) => (
              <CopilotActionPill
                key={entity.id}
                entity={entity}
                onPress={onNavigateAction}
              />
            ))}
          </View>
        )}

        {/* Dynamic Follow-up Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && onSelectSuggestion && (
          <View style={styles.suggestionsContainer}>
            <View style={styles.suggestionHeader}>
              <Ionicons name="bulb-outline" size={12} color="#FBBF24" />
              <Text style={styles.suggestionHeaderText}>ÖNERİLEN TAKİP SORULARI</Text>
            </View>
            <View style={styles.suggestionsList}>
              {message.suggestions.map((sug, i) => (
                <TouchableOpacity
                  key={`sug-${i}`}
                  style={styles.suggestionChip}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    onSelectSuggestion(sug);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={12} color="#38BDF8" />
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {sug}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Bubble Footer / Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            {message.usedData && (
              <View style={styles.erpBadge}>
                <Ionicons name="server-outline" size={9} color="#38BDF8" />
                <Text style={styles.erpBadgeText}>ERP Doğrulandı</Text>
              </View>
            )}
            <Text style={[styles.timestamp, isUser && styles.timestampUser]}>
              {formattedTime}
            </Text>
          </View>

          {!isUser && !message.error && (
            <TouchableOpacity
              onPress={handleCopy}
              style={styles.copyBtn}
              activeOpacity={0.6}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'share-outline'}
                size={13}
                color={copied ? '#10B981' : '#64748B'}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* User Avatar */}
      {isUser && (
        <View style={styles.avatarUser}>
          <Ionicons name="person" size={13} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  avatarBot: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarError: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  avatarUser: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bubbleBot: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bubbleUser: {
    backgroundColor: '#0EA5E9',
    borderBottomRightRadius: 4,
  },
  bubbleError: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderBottomLeftRadius: 4,
  },
  actionContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  actionHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.6,
  },
  suggestionsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  suggestionHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.6,
  },
  suggestionsList: {
    gap: 6,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  suggestionText: {
    fontSize: 12,
    color: '#E2E8F0',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  erpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  erpBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#38BDF8',
  },
  timestamp: {
    fontSize: 10,
    color: '#64748B',
  },
  timestampUser: {
    color: 'rgba(255,255,255,0.7)',
  },
  copyBtn: {
    padding: 3,
  },
});
