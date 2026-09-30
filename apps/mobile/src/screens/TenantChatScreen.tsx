import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../types/navigation.types';
import { useTenantChatStore } from '../store/tenant-chat.store';
import { useAuthStore } from '../store/auth.store';
import { useTheme } from '../design-system/hooks/useTheme';
import { useResponsive } from '../design-system/hooks/useResponsive';
import { MasterDetailContainer } from '../navigation/MasterDetailContainer';
import {
  ConversationListItem,
  ChatMessageItem,
  ChatComposer,
  NewConversationModal,
  EditMessageModal,
} from '../components/chat';
import { ChatMessage, ChatConversation } from '@repo/types/chat';

type TenantChatScreenRouteProp = RouteProp<RootStackParamList, 'TenantChat'>;
type TenantChatScreenNavProp = NativeStackNavigationProp<RootStackParamList, 'TenantChat'>;

type FilterTab = 'ALL' | 'GROUPS' | 'DIRECT' | 'PINNED';

export default function TenantChatScreen() {
  const { theme, isDark } = useTheme();
  const { showMasterDetail } = useResponsive();
  const navigation = useNavigation<TenantChatScreenNavProp>();
  const route = useRoute<TenantChatScreenRouteProp>();

  const currentUserId = useAuthStore((state) => state.user?.id);

  const conversations = useTenantChatStore((state) => state.conversations);
  const activeConversationId = useTenantChatStore((state) => state.activeConversationId);
  const messages = useTenantChatStore((state) => state.messages);
  const isLoadingConversations = useTenantChatStore((state) => state.isLoadingConversations);
  const isLoadingMessages = useTenantChatStore((state) => state.isLoadingMessages);
  const isRealtimeConnected = useTenantChatStore((state) => state.isRealtimeConnected);
  const isSending = useTenantChatStore((state) => state.isSending);

  const loadConversations = useTenantChatStore((state) => state.loadConversations);
  const selectConversation = useTenantChatStore((state) => state.selectConversation);
  const loadMessages = useTenantChatStore((state) => state.loadMessages);
  const sendMessage = useTenantChatStore((state) => state.sendMessage);
  const editMessage = useTenantChatStore((state) => state.editMessage);
  const deleteMessage = useTenantChatStore((state) => state.deleteMessage);
  const toggleReaction = useTenantChatStore((state) => state.toggleReaction);
  const votePoll = useTenantChatStore((state) => state.votePoll);
  const respondEvent = useTenantChatStore((state) => state.respondEvent);
  const togglePin = useTenantChatStore((state) => state.togglePin);
  const toggleMute = useTenantChatStore((state) => state.toggleMute);
  const clearHistory = useTenantChatStore((state) => state.clearHistory);
  const createDirectChat = useTenantChatStore((state) => state.createDirectChat);
  const createGroupChat = useTenantChatStore((state) => state.createGroupChat);
  const startRealtime = useTenantChatStore((state) => state.startRealtime);

  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [replyMessage, setReplyMessage] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const messageListRef = useRef<FlatList<ChatMessage>>(null);
  const hasInitiallyScrolledRef = useRef<string | null>(null);

  useEffect(() => {
    hasInitiallyScrolledRef.current = null;
  }, [activeConversationId]);

  // Initialize real-time WebSocket connection
  useEffect(() => {
    const cleanupRealtime = startRealtime();
    loadConversations();
    return () => {
      cleanupRealtime();
    };
  }, []);

  // Handle route param initialConversationId
  useEffect(() => {
    if (route.params?.conversationId) {
      selectConversation(route.params.conversationId);
    }
  }, [route.params?.conversationId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const currentMessages = useMemo(
    () => (activeConversationId ? messages[activeConversationId] ?? [] : []),
    [messages, activeConversationId]
  );

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Search text
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesLastMsg = c.lastMessage?.content?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesLastMsg) return false;
      }
      // Tabs
      if (activeFilter === 'GROUPS') return c.type === 'GROUP';
      if (activeFilter === 'DIRECT') return c.type === 'DIRECT';
      if (activeFilter === 'PINNED') return Boolean(c.pinnedAt);
      return true;
    });
  }, [conversations, activeFilter, searchQuery]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadConversations(true);
    if (activeConversationId) {
      await loadMessages(activeConversationId, true);
    }
    setIsRefreshing(false);
  };

  const handleSendMessage = async (content: string, replyToMessageId?: string) => {
    if (!activeConversationId) return;
    const sent = await sendMessage(activeConversationId, content, replyToMessageId);
    if (sent) {
      setTimeout(() => {
        messageListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  };

  const handleEditMessage = (msg: ChatMessage) => {
    setEditingMessage(msg);
  };

  const handleClearHistory = () => {
    if (!activeConversationId) return;
    Alert.alert(
      'Geçmişi Temizle',
      'Bu işlem mesajları yalnızca sizin görünümünüzden kaldıracaktır.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: () => clearHistory(activeConversationId),
        },
      ]
    );
  };

  // ─────────────────────────────────────────────
  // Conversation List View (Left Pane / Mobile Root)
  // ─────────────────────────────────────────────
  const renderConversationListView = () => (
    <View style={[styles.listContainer, { backgroundColor: theme.colors.canvas }]}>
      {/* Top Header */}
      <View style={[styles.headerBar, { borderBottomColor: theme.colors.borderSubtle }]}>
        {!showMasterDetail && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        )}

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>
            Sohbet
          </Text>
          <View style={styles.realtimeStatus}>
            <View
              style={[
                styles.realtimeDot,
                { backgroundColor: isRealtimeConnected ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={[styles.realtimeText, { color: theme.colors.textMuted }]}>
              {isRealtimeConnected ? 'Canlı' : 'Bağlanıyor...'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => setIsSearchActive((prev) => !prev)}
          >
            <Ionicons
              name={isSearchActive ? 'close' : 'search'}
              size={20}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.newChatBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setIsNewModalOpen(true);
            }}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar Input (toggled) */}
      {isSearchActive && (
        <View style={[styles.searchBarWrap, { backgroundColor: theme.colors.surface0 }]}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            style={[styles.searchBarInput, { color: theme.colors.textPrimary }]}
            placeholder="Sohbet veya mesaj ara..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Filter Chips */}
      <View style={styles.filterTabsRow}>
        {(['ALL', 'DIRECT', 'GROUPS', 'PINNED'] as FilterTab[]).map((tab) => {
          const isActive = activeFilter === tab;
          const labels: Record<FilterTab, string> = {
            ALL: 'Tümü',
            DIRECT: 'Birebir',
            GROUPS: 'Gruplar',
            PINNED: 'Sabitlenenler',
          };
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive
                    ? theme.colors.primary
                    : isDark
                    ? 'rgba(255, 255, 255, 0.06)'
                    : '#F1F5F9',
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setActiveFilter(tab);
              }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  {
                    color: isActive ? '#FFFFFF' : theme.colors.textSecondary,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Conversations FlatList */}
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        renderItem={({ item }) => (
          <ConversationListItem
            conversation={item}
            isSelected={item.id === activeConversationId}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              selectConversation(item.id);
            }}
          />
        )}
        ListEmptyComponent={
          isLoadingConversations ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                Sohbet Bulunamadı
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
                {searchQuery
                  ? 'Arama kriterinize uygun sohbet yok.'
                  : 'Çalışma arkadaşlarınızla mesajlaşmak için yeni bir sohbet başlatın.'}
              </Text>
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => setIsNewModalOpen(true)}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyActionBtnText}>Yeni Sohbet Başlat</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </View>
  );

  // ─────────────────────────────────────────────
  // Conversation Detail View (Right Pane / Mobile Active)
  // ─────────────────────────────────────────────
  const renderDetailView = () => {
    if (!activeConversationId) {
      return null;
    }

    const isGroup = activeConversation?.type === 'GROUP';
    const isPinned = Boolean(activeConversation?.pinnedAt);
    const isMuted = activeConversation?.notificationLevel === 'NONE';
    const headerTitle = activeConversation?.title ?? 'Sohbet';
    const headerSubtitle = isGroup
      ? `${activeConversation?.members?.length ?? 0} katılımcı`
      : 'Birebir Sohbet';

    return (
      <KeyboardAvoidingView
        style={[styles.detailContainer, { backgroundColor: theme.colors.canvas }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Detail Header */}
        <View style={[styles.detailHeader, { borderBottomColor: theme.colors.borderSubtle }]}>
          {!showMasterDetail && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => selectConversation(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          )}

          <View style={styles.detailTitleWrap}>
            <Text style={[styles.detailTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {headerTitle}
            </Text>
            <Text style={[styles.detailSubtitle, { color: theme.colors.textMuted }]}>
              {headerSubtitle}
            </Text>
          </View>

          <View style={styles.detailHeaderActions}>
            {/* Toggle Mute */}
            <TouchableOpacity
              style={styles.detailHeaderBtn}
              onPress={() => toggleMute(activeConversation?.id ?? activeConversationId)}
            >
              <Ionicons
                name={isMuted ? 'volume-mute' : 'notifications-outline'}
                size={19}
                color={isMuted ? '#F59E0B' : theme.colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Toggle Pin */}
            <TouchableOpacity
              style={styles.detailHeaderBtn}
              onPress={() => togglePin(activeConversation?.id ?? activeConversationId)}
            >
              <Ionicons
                name={isPinned ? 'pin' : 'pin-outline'}
                size={19}
                color={isPinned ? theme.colors.primary : theme.colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Clear History */}
            <TouchableOpacity style={styles.detailHeaderBtn} onPress={handleClearHistory}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages List */}
        {isLoadingMessages && currentMessages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={messageListRef}
            data={currentMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesListContent}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={11}
            onContentSizeChange={() => {
              if (hasInitiallyScrolledRef.current !== activeConversationId && currentMessages.length > 0) {
                hasInitiallyScrolledRef.current = activeConversationId;
                messageListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            renderItem={({ item }) => {
              const isMe = item.sender.id === currentUserId;
              return (
                <ChatMessageItem
                  message={item}
                  isMe={isMe}
                  showSenderName={isGroup}
                  onReply={(msg) => setReplyMessage(msg)}
                  onReaction={(msgId, emoji) => toggleReaction(msgId, emoji)}
                  onVotePoll={(pollId, optId) => votePoll(pollId, optId)}
                  onRespondEvent={(evId, status) => respondEvent(evId, status)}
                  onEdit={handleEditMessage}
                  onDelete={(msgId) => deleteMessage(msgId)}
                />
              );
            }}
            ListEmptyComponent={
              isLoadingMessages ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              ) : (
                <View style={styles.emptyMessagesContainer}>
                  <Ionicons name="chatbubble-ellipses-outline" size={36} color={theme.colors.textMuted} />
                  <Text style={[styles.emptyMessagesText, { color: theme.colors.textMuted }]}>
                    Henüz bir mesaj yok. İlk mesajı siz yazın!
                  </Text>
                </View>
              )
            }
          />
        )}

        {/* Message Composer */}
        <ChatComposer
          replyMessage={replyMessage}
          onCancelReply={() => setReplyMessage(null)}
          onSend={handleSendMessage}
          isSending={isSending}
        />
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={styles.root}>
      {showMasterDetail ? (
        <MasterDetailContainer
          masterView={renderConversationListView()}
          detailView={renderDetailView()}
          masterWidth={360}
          emptyDetailTitle="Sohbet Seçin"
          emptyDetailSubtitle="Mesaj geçmişini görüntülemek veya yeni mesaj göndermek için sol listeden bir sohbet seçin."
          emptyDetailIcon="chatbubbles-outline"
        />
      ) : activeConversationId ? (
        renderDetailView()
      ) : (
        renderConversationListView()
      )}

      {/* New Conversation Modal */}
      <NewConversationModal
        visible={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSelectDirect={async (userId) => {
          await createDirectChat(userId);
        }}
        onCreateGroup={async (title, memberIds) => {
          await createGroupChat({ title, memberIds });
        }}
      />

      {/* Edit Message Modal (Cross-platform) */}
      <EditMessageModal
        visible={Boolean(editingMessage)}
        initialContent={editingMessage?.content ?? ''}
        onClose={() => setEditingMessage(null)}
        onSave={(newContent) => {
          if (editingMessage) {
            editMessage(editingMessage.id, newContent);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  realtimeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  realtimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  realtimeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionBtn: {
    padding: 6,
  },
  newChatBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    gap: 8,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 14,
  },
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  detailContainer: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailTitleWrap: {
    flex: 1,
    marginRight: 8,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  detailSubtitle: {
    fontSize: 12,
  },
  detailHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailHeaderBtn: {
    padding: 6,
  },
  messagesListContent: {
    paddingVertical: 12,
  },
  emptyMessagesContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyMessagesText: {
    fontSize: 13,
  },
});
