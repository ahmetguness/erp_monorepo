import { apiClient } from '../lib/api-client';
import {
  ChatConversation,
  ChatMessage,
  ChatConversationSchema,
  ChatMessageSchema,
  ChatCursorPageSchema,
  ChatUser,
  ChatUserSchema,
} from '@repo/types/chat';
import { z } from 'zod';

const ConversationPageSchema = z.object({
  items: z.array(ChatConversationSchema),
  nextCursor: z.string().nullable(),
});

const UnreadCountSchema = z.object({
  count: z.number().int().nonnegative(),
});

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TenantChatUser {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  roleName?: string;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const tenantChatService = {
  generateUUID,

  /**
   * Tenant içi toplam okunmamış sohbet mesaj sayısını döner.
   */
  async getUnreadCount(): Promise<number> {
    const response = await apiClient.get('/api/chat/conversations/unread-count');
    const parsed = UnreadCountSchema.safeParse(response.data?.data);
    return parsed.success ? parsed.data.count : 0;
  },

  /**
   * Kullanıcının dahil olduğu sohbetleri cursor ile listeler.
   */
  async listConversations(cursor?: string, limit = 40): Promise<CursorPage<ChatConversation>> {
    const response = await apiClient.get('/api/chat/conversations', {
      params: { cursor, limit },
    });
    return ConversationPageSchema.parse(response.data?.data);
  },

  /**
   * Belirli bir sohbetin mesaj geçmişini cursor ile çeker.
   */
  async listMessages(conversationId: string, cursor?: string, limit = 50): Promise<CursorPage<ChatMessage>> {
    const response = await apiClient.get(`/api/chat/conversations/${conversationId}/messages`, {
      params: { cursor, limit },
    });
    return ChatCursorPageSchema.parse(response.data?.data);
  },

  /**
   * Belirli bir kullanıcıyla bire bir (DIRECT) sohbet açar veya var olanı getirir.
   */
  async createDirectConversation(userId: string): Promise<ChatConversation> {
    const response = await apiClient.post('/api/chat/conversations/direct', { userId });
    return ChatConversationSchema.parse(response.data?.data);
  },

  /**
   * Yeni bir grup sohbeti oluşturur.
   */
  async createGroupConversation(input: {
    title: string;
    description?: string;
    memberIds: string[];
  }): Promise<ChatConversation> {
    const response = await apiClient.post('/api/chat/conversations/groups', {
      ...input,
      historyVisibility: 'FROM_JOIN',
    });
    return ChatConversationSchema.parse(response.data?.data);
  },

  /**
   * Mesaj gönderir (metin, yanıt veya eklerle).
   */
  async sendMessage(
    conversationId: string,
    input: {
      clientMessageId?: string;
      content: string | null;
      replyToMessageId?: string;
      attachmentIds?: string[];
      mentionUserIds?: string[];
    }
  ): Promise<ChatMessage> {
    const payload = {
      clientMessageId: input.clientMessageId ?? generateUUID(),
      content: input.content,
      type: (input.attachmentIds && input.attachmentIds.length > 0) ? 'FILE' : 'TEXT',
      replyToMessageId: input.replyToMessageId,
      attachmentIds: input.attachmentIds ?? [],
      mentionUserIds: input.mentionUserIds ?? [],
    };
    const response = await apiClient.post(`/api/chat/conversations/${conversationId}/messages`, payload);
    return ChatMessageSchema.parse(response.data?.data);
  },

  /**
   * Mesajı düzenler.
   */
  async editMessage(messageId: string, content: string, expectedUpdatedAt?: string): Promise<ChatMessage> {
    const response = await apiClient.patch(`/api/chat/messages/${messageId}`, {
      content,
      expectedUpdatedAt,
    });
    return ChatMessageSchema.parse(response.data?.data);
  },

  /**
   * Mesajı siler (soft delete).
   */
  async deleteMessage(messageId: string): Promise<ChatMessage> {
    const response = await apiClient.delete(`/api/chat/messages/${messageId}`);
    return ChatMessageSchema.parse(response.data?.data);
  },

  /**
   * Mesajı diğer sohbetlere iletir.
   */
  async forwardMessage(messageId: string, conversationIds: string[]): Promise<ChatMessage[]> {
    const response = await apiClient.post(`/api/chat/messages/${messageId}/forward`, {
      conversationIds,
    });
    return z.array(ChatMessageSchema).parse(response.data?.data);
  },

  /**
   * Sohbeti okundu olarak işaretler.
   */
  async markRead(conversationId: string, messageId: string): Promise<void> {
    await apiClient.post(`/api/chat/conversations/${conversationId}/read`, { messageId });
  },

  /**
   * Sohbeti sabitler veya sabitlemeyi kaldırır.
   */
  async pinConversation(conversationId: string, pinned: boolean): Promise<void> {
    await apiClient.put(`/api/chat/conversations/${conversationId}/pin`, { pinned });
  },

  /**
   * Sohbeti sessize alır veya bildirimleri açar.
   */
  async muteConversation(conversationId: string, muted: boolean): Promise<void> {
    await apiClient.put(`/api/chat/conversations/${conversationId}/mute`, {
      mutedUntil: muted ? '9999-12-31T23:59:59.000Z' : null,
      notificationLevel: muted ? 'NONE' : 'ALL',
    });
  },

  /**
   * Kullanıcının kendi görünümünden sohbet geçmişini temizler.
   */
  async clearConversation(conversationId: string): Promise<void> {
    await apiClient.post(`/api/chat/conversations/${conversationId}/clear`);
  },

  /**
   * Mesaja emoji tepkisi ekler veya kaldırır.
   */
  async setMessageReaction(messageId: string, emoji: string, reacted: boolean): Promise<void> {
    await apiClient.request({
      method: reacted ? 'PUT' : 'DELETE',
      url: `/api/chat/messages/${messageId}/reactions`,
      data: { emoji },
    });
  },

  /**
   * Mesajı yıldızlar veya yıldızı kaldırır.
   */
  async setMessageStar(messageId: string, starred: boolean): Promise<void> {
    await apiClient.request({
      method: starred ? 'PUT' : 'DELETE',
      url: `/api/chat/messages/${messageId}/star`,
    });
  },

  /**
   * Mesajı sabitler veya sabitlemeyi kaldırır.
   */
  async setMessagePin(messageId: string, pinned: boolean): Promise<void> {
    await apiClient.request({
      method: pinned ? 'PUT' : 'DELETE',
      url: `/api/chat/messages/${messageId}/pin`,
    });
  },

  /**
   * Ankete oy verir.
   */
  async votePoll(pollId: string, optionIds: string[]): Promise<void> {
    await apiClient.post(`/api/chat/polls/${pollId}/votes`, { optionIds });
  },

  /**
   * Etkinliğe katılım yanıtı verir.
   */
  async respondEvent(eventId: string, status: 'GOING' | 'MAYBE' | 'DECLINED'): Promise<void> {
    await apiClient.put(`/api/chat/events/${eventId}/response`, { status });
  },

  /**
   * Mesajlar içinde arama yapar.
   */
  async searchMessages(query: string, conversationId?: string): Promise<CursorPage<ChatMessage>> {
    const response = await apiClient.get('/api/chat/search', {
      params: { q: query, conversationId, limit: 30 },
    });
    return ChatCursorPageSchema.parse(response.data?.data);
  },

  /**
   * Tenant içindeki kullanıcıları listeler (yeni sohbet başlatmak için).
   */
  async getTenantUsers(): Promise<TenantChatUser[]> {
    try {
      const response = await apiClient.get('/api/users');
      const data = response.data?.data;
      if (!Array.isArray(data)) return [];
      return data
        .filter((item: any) => item?.user && item?.isActive)
        .map((item: any) => ({
          id: item.user.id,
          userId: item.user.id,
          name: item.user.name || 'İsimsiz Kullanıcı',
          email: item.user.email,
          phone: item.user.phone,
          roleName: item.roleRef?.name,
        }));
    } catch {
      return [];
    }
  },
};
