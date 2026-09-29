import { create } from 'zustand';
import {
  ChatConversation,
  ChatMessage,
  ChatRealtimeEvent,
} from '@repo/types/chat';
import { tenantChatService } from '../services/tenant-chat.service';
import { tenantChatRealtime } from '../services/tenant-chat-realtime.service';

interface TenantChatState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  unreadCount: number;
  isRealtimeConnected: boolean;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  searchQuery: string;
  searchResults: ChatMessage[];
  isSearching: boolean;
}

interface TenantChatActions {
  loadConversations: (refresh?: boolean) => Promise<void>;
  selectConversation: (conversationId: string | null) => Promise<void>;
  loadMessages: (conversationId: string, refresh?: boolean) => Promise<void>;
  sendMessage: (
    conversationId: string,
    content: string,
    replyToMessageId?: string
  ) => Promise<ChatMessage | null>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  votePoll: (pollId: string, optionId: string) => Promise<void>;
  respondEvent: (
    eventId: string,
    status: 'GOING' | 'MAYBE' | 'DECLINED'
  ) => Promise<void>;
  togglePin: (conversationId: string) => Promise<void>;
  toggleMute: (conversationId: string) => Promise<void>;
  clearHistory: (conversationId: string) => Promise<void>;
  createDirectChat: (userId: string) => Promise<ChatConversation>;
  createGroupChat: (input: {
    title: string;
    description?: string;
    memberIds: string[];
  }) => Promise<ChatConversation>;
  setSearchQuery: (query: string) => void;
  performSearch: (query: string, conversationId?: string) => Promise<void>;
  clearSearch: () => void;
  startRealtime: () => () => void;
  handleRealtimeEvent: (event: ChatRealtimeEvent) => void;
}

export type TenantChatStore = TenantChatState & TenantChatActions;

function sortConversations(items: ChatConversation[]): ChatConversation[] {
  return [...items].sort((a, b) => {
    // Pinned conversations always first
    if (a.pinnedAt && !b.pinnedAt) return -1;
    if (!a.pinnedAt && b.pinnedAt) return 1;
    // Then newest updated first
    const timeA = new Date(a.updatedAt).getTime();
    const timeB = new Date(b.updatedAt).getTime();
    return timeB - timeA;
  });
}

export const useTenantChatStore = create<TenantChatStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  unreadCount: 0,
  isRealtimeConnected: false,
  isLoadingConversations: false,
  isLoadingMessages: false,
  isSending: false,
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  loadConversations: async (refresh = false) => {
    if (!refresh && get().conversations.length > 0) return;
    set({ isLoadingConversations: true });
    try {
      const [page, count] = await Promise.all([
        tenantChatService.listConversations(),
        tenantChatService.getUnreadCount(),
      ]);
      set({
        conversations: sortConversations(page.items),
        unreadCount: count,
        isLoadingConversations: false,
      });
    } catch (err) {
      console.warn('[TenantChatStore] Failed to load conversations:', err);
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (conversationId: string | null) => {
    set({ activeConversationId: conversationId });
    if (!conversationId) return;

    // Load messages if not cached
    if (!get().messages[conversationId]) {
      await get().loadMessages(conversationId);
    }

    // Mark as read if has unread
    const target = get().conversations.find((c) => c.id === conversationId);
    if (target && target.unreadCount > 0 && target.lastMessage) {
      try {
        await tenantChatService.markRead(conversationId, target.lastMessage.id);
        set((state) => {
          const updatedConversations = state.conversations.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c
          );
          const totalUnread = updatedConversations.reduce((sum, c) => sum + c.unreadCount, 0);
          return {
            conversations: updatedConversations,
            unreadCount: totalUnread,
          };
        });
      } catch (err) {
        console.warn('[TenantChatStore] Failed to mark read:', err);
      }
    }
  },

  loadMessages: async (conversationId: string, refresh = false) => {
    if (!refresh && get().messages[conversationId]?.length) return;
    set({ isLoadingMessages: true });
    try {
      const page = await tenantChatService.listMessages(conversationId);
      // Items returned in desc, reverse to chronological (oldest to newest)
      const chronological = [...page.items].reverse();
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: chronological,
        },
        isLoadingMessages: false,
      }));
    } catch (err) {
      console.warn('[TenantChatStore] Failed to load messages:', err);
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (conversationId: string, content: string, replyToMessageId?: string) => {
    if (!content.trim()) return null;
    set({ isSending: true });
    try {
      const sent = await tenantChatService.sendMessage(conversationId, {
        content: content.trim(),
        replyToMessageId,
      });

      set((state) => {
        const existingMessages = state.messages[conversationId] ?? [];
        const nextMessages = existingMessages.some((m) => m.id === sent.id)
          ? existingMessages
          : [...existingMessages, sent];

        const updatedConversations = state.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessage: sent, updatedAt: sent.createdAt }
            : c
        );

        return {
          messages: {
            ...state.messages,
            [conversationId]: nextMessages,
          },
          conversations: sortConversations(updatedConversations),
          isSending: false,
        };
      });

      return sent;
    } catch (err) {
      console.warn('[TenantChatStore] Failed to send message:', err);
      set({ isSending: false });
      return null;
    }
  },

  editMessage: async (messageId: string, newContent: string) => {
    const { activeConversationId, messages } = get();
    if (!activeConversationId) return;

    try {
      const updated = await tenantChatService.editMessage(messageId, newContent.trim());
      set((state) => {
        const currentList = state.messages[activeConversationId] ?? [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: currentList.map((m) => (m.id === messageId ? updated : m)),
          },
        };
      });
    } catch (err) {
      console.warn('[TenantChatStore] Failed to edit message:', err);
    }
  },

  deleteMessage: async (messageId: string) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    try {
      const deleted = await tenantChatService.deleteMessage(messageId);
      set((state) => {
        const currentList = state.messages[activeConversationId] ?? [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: currentList.map((m) => (m.id === messageId ? deleted : m)),
          },
        };
      });
    } catch (err) {
      console.warn('[TenantChatStore] Failed to delete message:', err);
    }
  },

  toggleReaction: async (messageId: string, emoji: string) => {
    const { activeConversationId, messages } = get();
    if (!activeConversationId) return;

    const currentList = messages[activeConversationId] ?? [];
    const targetMessage = currentList.find((m) => m.id === messageId);
    if (!targetMessage) return;

    const existingReaction = targetMessage.reactions.find((r) => r.emoji === emoji);
    const currentlyReacted = existingReaction ? existingReaction.reactedByMe : false;

    // Optimistic local update
    const nextReactions = [...targetMessage.reactions];
    const index = nextReactions.findIndex((r) => r.emoji === emoji);

    if (currentlyReacted) {
      if (index >= 0) {
        if (nextReactions[index].count <= 1) {
          nextReactions.splice(index, 1);
        } else {
          nextReactions[index] = {
            ...nextReactions[index],
            count: nextReactions[index].count - 1,
            reactedByMe: false,
          };
        }
      }
    } else {
      if (index >= 0) {
        nextReactions[index] = {
          ...nextReactions[index],
          count: nextReactions[index].count + 1,
          reactedByMe: true,
        };
      } else {
        nextReactions.push({ emoji, count: 1, reactedByMe: true });
      }
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [activeConversationId]: (state.messages[activeConversationId] ?? []).map((m) =>
          m.id === messageId ? { ...m, reactions: nextReactions } : m
        ),
      },
    }));

    try {
      await tenantChatService.setMessageReaction(messageId, emoji, !currentlyReacted);
    } catch (err) {
      console.warn('[TenantChatStore] Failed to toggle reaction:', err);
      // Revert on error by refetching
      await get().loadMessages(activeConversationId, true);
    }
  },

  votePoll: async (pollId: string, optionId: string) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    try {
      await tenantChatService.votePoll(pollId, [optionId]);
      await get().loadMessages(activeConversationId, true);
    } catch (err) {
      console.warn('[TenantChatStore] Failed to vote poll:', err);
    }
  },

  respondEvent: async (eventId: string, status: 'GOING' | 'MAYBE' | 'DECLINED') => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    try {
      await tenantChatService.respondEvent(eventId, status);
      await get().loadMessages(activeConversationId, true);
    } catch (err) {
      console.warn('[TenantChatStore] Failed to respond to event:', err);
    }
  },

  togglePin: async (conversationId: string) => {
    const target = get().conversations.find((c) => c.id === conversationId);
    if (!target) return;
    const nextPinned = !target.pinnedAt;

    set((state) => ({
      conversations: sortConversations(
        state.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, pinnedAt: nextPinned ? new Date().toISOString() : null }
            : c
        )
      ),
    }));

    try {
      await tenantChatService.pinConversation(conversationId, nextPinned);
    } catch (err) {
      console.warn('[TenantChatStore] Failed to pin conversation:', err);
      await get().loadConversations(true);
    }
  },

  toggleMute: async (conversationId: string) => {
    const target = get().conversations.find((c) => c.id === conversationId);
    if (!target) return;
    const isMuted = target.notificationLevel === 'NONE';
    const nextMuted = !isMuted;

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
            ...c,
            notificationLevel: nextMuted ? ('NONE' as const) : ('ALL' as const),
            mutedUntil: nextMuted ? '9999-12-31T23:59:59.000Z' : null,
          }
          : c
      ),
    }));

    try {
      await tenantChatService.muteConversation(conversationId, nextMuted);
    } catch (err) {
      console.warn('[TenantChatStore] Failed to mute conversation:', err);
      await get().loadConversations(true);
    }
  },

  clearHistory: async (conversationId: string) => {
    try {
      await tenantChatService.clearConversation(conversationId);
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: [],
        },
      }));
    } catch (err) {
      console.warn('[TenantChatStore] Failed to clear history:', err);
    }
  },

  createDirectChat: async (userId: string) => {
    const conv = await tenantChatService.createDirectConversation(userId);
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conv.id);
      return {
        conversations: sortConversations(
          exists ? state.conversations : [conv, ...state.conversations]
        ),
      };
    });
    await get().selectConversation(conv.id);
    return conv;
  },

  createGroupChat: async (input) => {
    const conv = await tenantChatService.createGroupConversation(input);
    set((state) => ({
      conversations: sortConversations([conv, ...state.conversations]),
    }));
    await get().selectConversation(conv.id);
    return conv;
  },

  setSearchQuery: (searchQuery: string) => {
    set({ searchQuery });
    if (!searchQuery.trim()) {
      set({ searchResults: [], isSearching: false });
    }
  },

  performSearch: async (query: string, conversationId?: string) => {
    if (query.trim().length < 2) {
      set({ searchResults: [], isSearching: false });
      return;
    }
    set({ isSearching: true });
    try {
      const results = await tenantChatService.searchMessages(query.trim(), conversationId);
      set({ searchResults: results.items, isSearching: false });
    } catch (err) {
      console.warn('[TenantChatStore] Search error:', err);
      set({ searchResults: [], isSearching: false });
    }
  },

  clearSearch: () => {
    set({ searchQuery: '', searchResults: [], isSearching: false });
  },

  startRealtime: () => {
    tenantChatRealtime.connect();
    set({ isRealtimeConnected: true });

    const unsubscribe = tenantChatRealtime.subscribe((event) => {
      get().handleRealtimeEvent(event);
    });

    return () => {
      unsubscribe();
      tenantChatRealtime.disconnect();
      set({ isRealtimeConnected: false });
    };
  },

  handleRealtimeEvent: (event: ChatRealtimeEvent) => {
    const { activeConversationId } = get();

    switch (event.type) {
      case 'message.created': {
        const message = event.payload?.message as ChatMessage | undefined;
        if (!message) {
          // If payload is partial, refresh conversations & active messages
          void get().loadConversations(true);
          if (activeConversationId === event.conversationId) {
            void get().loadMessages(event.conversationId, true);
          }
          return;
        }

        set((state) => {
          const list = state.messages[event.conversationId] ?? [];
          const exists = list.some((m) => m.id === message.id);
          const nextList = exists ? list : [...list, message];

          const isCurrentActive = activeConversationId === event.conversationId;
          const updatedConversations = state.conversations.map((c) =>
            c.id === event.conversationId
              ? {
                ...c,
                lastMessage: message,
                updatedAt: message.createdAt,
                unreadCount: isCurrentActive ? 0 : c.unreadCount + 1,
              }
              : c
          );

          const totalUnread = updatedConversations.reduce((sum, c) => sum + c.unreadCount, 0);

          return {
            messages: {
              ...state.messages,
              [event.conversationId]: nextList,
            },
            conversations: sortConversations(updatedConversations),
            unreadCount: totalUnread,
          };
        });

        // If currently looking at this conversation, mark as read on backend too
        if (activeConversationId === event.conversationId) {
          tenantChatService.markRead(event.conversationId, message.id).catch(() => { });
        }
        break;
      }

      case 'message.updated':
      case 'message.deleted':
      case 'message.reaction_updated':
      case 'poll.updated':
      case 'event.updated': {
        if (activeConversationId === event.conversationId) {
          void get().loadMessages(event.conversationId, true);
        }
        void get().loadConversations(true);
        break;
      }

      case 'conversation.updated':
      case 'conversation.read_updated':
      case 'conversation.member_added':
      case 'conversation.member_removed':
      case 'sync.required': {
        void get().loadConversations(true);
        break;
      }
    }
  },
}));
