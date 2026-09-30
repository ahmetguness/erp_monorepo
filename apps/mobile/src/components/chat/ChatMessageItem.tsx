import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ChatMessage, ChatPollView, ChatEventView } from '@repo/types/chat';
import { useTheme } from '../../design-system/hooks/useTheme';

interface ChatMessageItemProps {
  message: ChatMessage;
  isMe: boolean;
  showSenderName?: boolean;
  onReply?: (message: ChatMessage) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onVotePoll?: (pollId: string, optionId: string) => void;
  onRespondEvent?: (eventId: string, status: 'GOING' | 'MAYBE' | 'DECLINED') => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
}

const COMMON_REACTIONS = ['👍', '❤️', '👏', '🎉', '🚀', '👀'];

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  message,
  isMe,
  showSenderName = false,
  onReply,
  onReaction,
  onVotePoll,
  onRespondEvent,
  onEdit,
  onDelete,
}) => {
  const { theme, isDark } = useTheme();
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsActionModalOpen(true);
  };

  const handleSelectReaction = (emoji: string) => {
    setIsActionModalOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onReaction?.(message.id, emoji);
  };

  const handleDelete = () => {
    setIsActionModalOpen(false);
    Alert.alert(
      'Mesajı Sil',
      'Bu mesajı silmek istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => onDelete?.(message.id),
        },
      ]
    );
  };

  // ─────────────────────────────────────────────
  // Render Poll Widget
  // ─────────────────────────────────────────────
  const renderPoll = (poll: ChatPollView) => {
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.voteCount, 0);

    return (
      <View style={[styles.widgetContainer, { borderColor: theme.colors.borderSubtle }]}>
        <View style={styles.widgetHeader}>
          <Ionicons name="stats-chart" size={16} color={theme.colors.primary} />
          <Text style={[styles.pollQuestion, { color: theme.colors.textPrimary }]}>
            {poll.question}
          </Text>
        </View>

        <View style={styles.pollOptionsList}>
          {poll.options.map((opt) => {
            const percent = totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.pollOptionBtn,
                  {
                    backgroundColor: opt.selectedByMe
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.25)'
                        : '#DBEAFE'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.05)'
                      : '#F1F5F9',
                    borderColor: opt.selectedByMe ? theme.colors.primary : 'transparent',
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => onVotePoll?.(poll.id, opt.id)}
              >
                <View
                  style={[
                    styles.pollProgressFill,
                    {
                      width: `${percent}%`,
                      backgroundColor: opt.selectedByMe
                        ? isDark
                          ? 'rgba(59, 130, 246, 0.35)'
                          : '#BFDBFE'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.08)'
                        : '#E2E8F0',
                    },
                  ]}
                />
                <View style={styles.pollOptionContent}>
                  <View style={styles.optionLabelRow}>
                    <Ionicons
                      name={opt.selectedByMe ? 'checkmark-circle' : 'radio-button-off'}
                      size={16}
                      color={opt.selectedByMe ? theme.colors.primary : theme.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.pollOptionLabel,
                        {
                          color: opt.selectedByMe
                            ? theme.colors.primary
                            : theme.colors.textPrimary,
                          fontWeight: opt.selectedByMe ? '600' : '400',
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  <Text style={[styles.pollOptionPercent, { color: theme.colors.textSecondary }]}>
                    %{percent} ({opt.voteCount})
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.pollFooter, { color: theme.colors.textMuted }]}>
          Toplam {totalVotes} oy • {poll.multiple ? 'Çoklu seçim' : 'Tek seçim'}
        </Text>
      </View>
    );
  };

  // ─────────────────────────────────────────────
  // Render Event Widget
  // ─────────────────────────────────────────────
  const renderEvent = (event: ChatEventView) => {
    const starts = new Date(event.startsAt).toLocaleString([], {
      dateStyle: 'short',
      timeStyle: 'short',
    });

    return (
      <View style={[styles.widgetContainer, { borderColor: theme.colors.borderSubtle }]}>
        <View style={styles.widgetHeader}>
          <Ionicons name="calendar" size={18} color="#F59E0B" />
          <Text style={[styles.pollQuestion, { color: theme.colors.textPrimary }]}>
            {event.title}
          </Text>
        </View>

        {Boolean(event.description) && (
          <Text style={[styles.eventDesc, { color: theme.colors.textSecondary }]}>
            {event.description}
          </Text>
        )}

        <View style={styles.eventTimeRow}>
          <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
          <Text style={[styles.eventTimeText, { color: theme.colors.textSecondary }]}>
            {starts}
          </Text>
        </View>

        {Boolean(event.location) && (
          <View style={styles.eventTimeRow}>
            <Ionicons name="location-outline" size={14} color={theme.colors.textMuted} />
            <Text style={[styles.eventTimeText, { color: theme.colors.textSecondary }]}>
              {event.location}
            </Text>
          </View>
        )}

        {/* RSVP Buttons */}
        <View style={styles.rsvpRow}>
          <TouchableOpacity
            style={[
              styles.rsvpBtn,
              event.myResponse === 'GOING' && {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#D1FAE5',
                borderColor: '#10B981',
              },
            ]}
            onPress={() => onRespondEvent?.(event.id, 'GOING')}
          >
            <Text
              style={[
                styles.rsvpText,
                { color: event.myResponse === 'GOING' ? '#10B981' : theme.colors.textSecondary },
              ]}
            >
              ✓ Katılıyorum
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.rsvpBtn,
              event.myResponse === 'MAYBE' && {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FEF3C7',
                borderColor: '#F59E0B',
              },
            ]}
            onPress={() => onRespondEvent?.(event.id, 'MAYBE')}
          >
            <Text
              style={[
                styles.rsvpText,
                { color: event.myResponse === 'MAYBE' ? '#F59E0B' : theme.colors.textSecondary },
              ]}
            >
              ? Belki
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.rsvpBtn,
              event.myResponse === 'DECLINED' && {
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FEE2E2',
                borderColor: '#EF4444',
              },
            ]}
            onPress={() => onRespondEvent?.(event.id, 'DECLINED')}
          >
            <Text
              style={[
                styles.rsvpText,
                { color: event.myResponse === 'DECLINED' ? '#EF4444' : theme.colors.textSecondary },
              ]}
            >
              ✕ Hayır
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={handleLongPress}
        style={[
          styles.bubble,
          isMe
            ? [
                styles.bubbleMe,
                {
                  backgroundColor: isDark ? '#1E3A8A' : '#2563EB',
                },
              ]
            : [
                styles.bubbleOther,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  borderColor: theme.colors.borderSubtle,
                },
              ],
        ]}
      >
        {/* Sender Name in Group Chat */}
        {showSenderName && !isMe && (
          <Text style={[styles.senderName, { color: theme.colors.primary }]}>
            {message.sender.name}
          </Text>
        )}

        {/* Quoted Reply Banner */}
        {Boolean(message.replyTo) && (
          <View
            style={[
              styles.replyBanner,
              {
                borderLeftColor: isMe ? '#93C5FD' : theme.colors.primary,
                backgroundColor: isMe ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <Text style={[styles.replySender, { color: isMe ? '#DBEAFE' : theme.colors.primary }]}>
              {message.replyTo?.senderName}
            </Text>
            <Text
              style={[styles.replyContent, { color: isMe ? '#E0E7FF' : theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              {message.replyTo?.content || 'Mesaj'}
            </Text>
          </View>
        )}

        {/* Text Content */}
        {Boolean(message.content) && (
          <Text
            style={[
              styles.messageText,
              {
                color: isMe ? '#FFFFFF' : theme.colors.textPrimary,
              },
            ]}
          >
            {message.content}
          </Text>
        )}

        {/* Poll Attachment */}
        {Boolean(message.poll) && renderPoll(message.poll!)}

        {/* Event Attachment */}
        {Boolean(message.event) && renderEvent(message.event!)}

        {/* File Attachments */}
        {message.attachments.map((att) => (
          <View
            key={att.id}
            style={[
              styles.attachmentBox,
              {
                backgroundColor: isMe ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <Ionicons
              name={att.kind === 'IMAGE' ? 'image' : 'document-attach'}
              size={18}
              color={isMe ? '#FFFFFF' : theme.colors.primary}
            />
            <Text
              style={[
                styles.attachmentName,
                { color: isMe ? '#FFFFFF' : theme.colors.textPrimary },
              ]}
              numberOfLines={1}
            >
              {att.originalName}
            </Text>
          </View>
        ))}

        {/* Footer: Time & Meta */}
        <View style={styles.footerRow}>
          {message.pinned && (
            <Ionicons
              name="pin"
              size={11}
              color={isMe ? '#BFDBFE' : theme.colors.primary}
              style={{ marginRight: 4 }}
            />
          )}
          {Boolean(message.editedAt) && (
            <Text style={[styles.metaText, { color: isMe ? '#BFDBFE' : theme.colors.textMuted }]}>
              düzenlendi{' '}
            </Text>
          )}
          <Text style={[styles.metaText, { color: isMe ? '#BFDBFE' : theme.colors.textMuted }]}>
            {formattedTime}
          </Text>
        </View>

        {/* Emoji Reactions Row */}
        {message.reactions.length > 0 && (
          <View style={styles.reactionsRow}>
            {message.reactions.map((r) => (
              <TouchableOpacity
                key={r.emoji}
                style={[
                  styles.reactionPill,
                  {
                    backgroundColor: r.reactedByMe
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.4)'
                        : '#DBEAFE'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.1)'
                      : '#FFFFFF',
                    borderColor: r.reactedByMe ? theme.colors.primary : theme.colors.borderSubtle,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => onReaction?.(message.id, r.emoji)}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text
                  style={[
                    styles.reactionCount,
                    {
                      color: r.reactedByMe
                        ? theme.colors.primary
                        : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {r.count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>

      {/* Action / Context Modal */}
      <Modal
        visible={isActionModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsActionModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsActionModalOpen(false)}
        >
          <View
            style={[
              styles.actionMenuCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.borderSubtle,
              },
            ]}
          >
            {/* Quick Reactions Bar */}
            <View style={styles.quickReactionsRow}>
              {COMMON_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.quickReactionBtn}
                  onPress={() => handleSelectReaction(emoji)}
                >
                  <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            {/* Menu Options */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setIsActionModalOpen(false);
                onReply?.(message);
              }}
            >
              <Ionicons name="arrow-undo-outline" size={18} color={theme.colors.textPrimary} />
              <Text style={[styles.menuItemText, { color: theme.colors.textPrimary }]}>
                Yanıtla
              </Text>
            </TouchableOpacity>

            {isMe && (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsActionModalOpen(false);
                    onEdit?.(message);
                  }}
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.colors.textPrimary} />
                  <Text style={[styles.menuItemText, { color: theme.colors.textPrimary }]}>
                    Düzenle
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Sil</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    marginVertical: 4,
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  rowMe: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bubbleMe: {
    borderBottomRightRadius: 3,
  },
  bubbleOther: {
    borderBottomLeftRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  replyBanner: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 3,
    marginBottom: 6,
    borderRadius: 4,
  },
  replySender: {
    fontSize: 11,
    fontWeight: '700',
  },
  replyContent: {
    fontSize: 12,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  attachmentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  attachmentName: {
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  metaText: {
    fontSize: 11,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionEmoji: {
    fontSize: 12,
    marginRight: 3,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  widgetContainer: {
    marginVertical: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  pollQuestion: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  pollOptionsList: {
    gap: 6,
  },
  pollOptionBtn: {
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
  },
  pollProgressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  pollOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  pollOptionLabel: {
    fontSize: 13,
  },
  pollOptionPercent: {
    fontSize: 12,
    fontWeight: '600',
  },
  pollFooter: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'right',
  },
  eventDesc: {
    fontSize: 12,
    marginBottom: 6,
  },
  eventTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  eventTimeText: {
    fontSize: 12,
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  rsvpBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rsvpText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionMenuCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  quickReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  quickReactionBtn: {
    padding: 6,
  },
  quickReactionEmoji: {
    fontSize: 24,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
