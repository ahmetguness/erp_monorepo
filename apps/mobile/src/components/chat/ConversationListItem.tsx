import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatConversation } from '@repo/types/chat';
import { useTheme } from '../../design-system/hooks/useTheme';

interface ConversationListItemProps {
  conversation: ChatConversation;
  isSelected?: boolean;
  onPress: () => void;
}

function formatChatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 1) return 'Dün';
    if (diffDays < 7) {
      const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
      return days[d.getDay()];
    }
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

function getAvatarColor(name: string): string {
  const colors = [
    '#3B82F6', '#8B5CF6', '#EC4899', '#10B981',
    '#F59E0B', '#6366F1', '#14B8A6', '#F97316',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  isSelected = false,
  onPress,
}) => {
  const { theme, isDark } = useTheme();

  const isGroup = conversation.type === 'GROUP';
  const isPinned = Boolean(conversation.pinnedAt);
  const isMuted = conversation.notificationLevel === 'NONE';
  const avatarBg = getAvatarColor(conversation.title);
  const initials = conversation.title
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const lastMessageText = conversation.lastMessage
    ? conversation.lastMessage.content ||
      (conversation.lastMessage.attachments.length > 0 ? '📎 Dosya eki' : 'Mesaj')
    : 'Henüz mesaj yok';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: isSelected
            ? isDark
              ? 'rgba(59, 130, 246, 0.18)'
              : '#EFF6FF'
            : isDark
            ? 'transparent'
            : '#FFFFFF',
          borderBottomColor: theme.colors.borderSubtle,
        },
      ]}
    >
      {/* Avatar with group badge */}
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
        {isGroup && (
          <View style={[styles.groupBadge, { backgroundColor: theme.colors.surfaceCard }]}>
            <Ionicons name="people" size={11} color={theme.colors.primary} />
          </View>
        )}
      </View>

      {/* Main Content */}
      <View style={styles.contentWrap}>
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            {isPinned && (
              <Ionicons
                name="pin"
                size={13}
                color={theme.colors.primary}
                style={styles.pinnedIcon}
              />
            )}
            <Text
              style={[
                styles.title,
                { color: theme.colors.textPrimary },
                conversation.unreadCount > 0 && styles.unreadTitle,
              ]}
              numberOfLines={1}
            >
              {conversation.title}
            </Text>
          </View>

          <Text
            style={[
              styles.timeText,
              { color: conversation.unreadCount > 0 ? theme.colors.primary : theme.colors.textMuted },
            ]}
          >
            {formatChatTime(conversation.updatedAt)}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={[
              styles.lastMessage,
              {
                color: conversation.unreadCount > 0
                  ? theme.colors.textPrimary
                  : theme.colors.textSecondary,
                fontWeight: conversation.unreadCount > 0 ? '600' : '400',
              },
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage?.sender?.name
              ? `${conversation.lastMessage.sender.name.split(' ')[0]}: ${lastMessageText}`
              : lastMessageText}
          </Text>

          <View style={styles.indicators}>
            {isMuted && (
              <Ionicons
                name="volume-mute"
                size={14}
                color={theme.colors.textMuted}
                style={styles.muteIcon}
              />
            )}
            {conversation.unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.unreadText}>
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  groupBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pinnedIcon: {
    marginRight: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  unreadTitle: {
    fontWeight: '700',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  indicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  muteIcon: {
    marginRight: 2,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
