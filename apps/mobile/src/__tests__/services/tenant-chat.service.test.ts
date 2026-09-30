import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantChatService } from '../../services/tenant-chat.service';
import { useTenantChatStore } from '../../store/tenant-chat.store';
import { apiClient } from '../../lib/api-client';
import { ChatConversation, ChatMessage, SendChatMessageSchema } from '@repo/types/chat';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  API_URL: 'http://localhost:3001',
}));

describe('tenant-chat.service & store (Mobile Tenant In-App Collaboration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUser = {
    id: 'user-1',
    name: 'Ahmet Yılmaz',
    email: 'ahmet@axon.com',
  };

  const mockOtherUser = {
    id: 'user-2',
    name: 'Mehmet Demir',
    email: 'mehmet@axon.com',
  };

  const mockConversation: ChatConversation = {
    id: 'conv-1',
    type: 'DIRECT',
    title: 'Mehmet Demir',
    description: null,
    members: [
      { user: mockUser, role: 'MEMBER' },
      { user: mockOtherUser, role: 'MEMBER' },
    ],
    lastMessage: null,
    unreadCount: 2,
    pinnedAt: null,
    mutedUntil: null,
    notificationLevel: 'ALL',
    updatedAt: new Date('2026-09-25T10:00:00.000Z').toISOString(),
  };

  const mockMessage: ChatMessage = {
    id: 'msg-1',
    conversationId: 'conv-1',
    clientMessageId: 'client-1',
    type: 'TEXT',
    content: 'Merhaba Mehmet Bey, sipariş durumunu kontrol edebilir misiniz?',
    sender: mockUser,
    replyTo: null,
    forwarded: false,
    mentionUserIds: [],
    attachments: [],
    reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
    poll: null,
    event: null,
    starredByMe: false,
    pinned: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-09-25T10:05:00.000Z').toISOString(),
    updatedAt: new Date('2026-09-25T10:05:00.000Z').toISOString(),
  };

  it('should fetch total unread chat count across tenant', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { count: 5 } },
    });

    const count = await tenantChatService.getUnreadCount();
    expect(count).toBe(5);
    expect(apiClient.get).toHaveBeenCalledWith('/api/chat/conversations/unread-count');
  });

  it('should list conversations with cursor pagination', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          items: [mockConversation],
          nextCursor: null,
        },
      },
    });

    const result = await tenantChatService.listConversations();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('conv-1');
    expect(result.items[0].title).toBe('Mehmet Demir');
  });

  it('should list messages with attachments and reactions', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          items: [mockMessage],
          nextCursor: null,
        },
      },
    });

    const result = await tenantChatService.listMessages('conv-1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].reactions).toHaveLength(1);
    expect(result.items[0].reactions[0].emoji).toBe('👍');
  });

  it('should send a new message with clientMessageId and payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { data: mockMessage },
    });

    const sent = await tenantChatService.sendMessage('conv-1', {
      content: 'Merhaba Mehmet Bey',
    });

    expect(sent.id).toBe('msg-1');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/chat/conversations/conv-1/messages',
      expect.objectContaining({
        content: 'Merhaba Mehmet Bey',
        type: 'TEXT',
      })
    );
  });

  it('should generate RFC4122 v4 compliant UUID passing SendChatMessageSchema', () => {
    const uuid = tenantChatService.generateUUID();
    const result = SendChatMessageSchema.safeParse({
      clientMessageId: uuid,
      content: 'Test mesajı',
    });
    expect(result.success).toBe(true);
  });

  it('should correctly sort conversations in store with pinned on top', async () => {
    const olderPinnedConv: ChatConversation = {
      ...mockConversation,
      id: 'conv-pinned',
      title: 'Önemli Duyurular',
      pinnedAt: new Date('2026-09-20T10:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-09-20T10:00:00.000Z').toISOString(),
    };

    const newerUnpinnedConv: ChatConversation = {
      ...mockConversation,
      id: 'conv-recent',
      title: 'Genel Sohbet',
      pinnedAt: null,
      updatedAt: new Date('2026-09-25T12:00:00.000Z').toISOString(),
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { items: [newerUnpinnedConv, olderPinnedConv], nextCursor: null } },
    });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { count: 3 } },
    });

    await useTenantChatStore.getState().loadConversations(true);

    const storeConversations = useTenantChatStore.getState().conversations;
    expect(storeConversations).toHaveLength(2);
    // Pinned should come first regardless of updatedAt
    expect(storeConversations[0].id).toBe('conv-pinned');
    expect(storeConversations[1].id).toBe('conv-recent');
  });

  it('should handle realtime message.created event and update unread count', () => {
    useTenantChatStore.setState({
      activeConversationId: null, // Not currently active
      conversations: [mockConversation],
      messages: {},
      unreadCount: 2,
    });

    const newMessage: ChatMessage = {
      ...mockMessage,
      id: 'msg-new-realtime',
      content: 'Yeni bildirim geldi!',
      createdAt: new Date('2026-09-25T11:00:00.000Z').toISOString(),
    };

    useTenantChatStore.getState().handleRealtimeEvent({
      id: 'evt-1',
      type: 'message.created',
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: { message: newMessage },
    });

    const updatedConv = useTenantChatStore.getState().conversations.find((c) => c.id === 'conv-1');
    expect(updatedConv?.unreadCount).toBe(3);
    expect(updatedConv?.lastMessage?.content).toBe('Yeni bildirim geldi!');
  });

  it('should silently refresh messages in background without toggling isLoadingMessages when cache exists', async () => {
    useTenantChatStore.setState({
      messages: { 'conv-1': [mockMessage] },
      isLoadingMessages: false,
    });

    let loadingStateDuringFetch = false;
    vi.mocked(apiClient.get).mockImplementationOnce(async () => {
      loadingStateDuringFetch = useTenantChatStore.getState().isLoadingMessages;
      return {
        data: {
          data: {
            items: [mockMessage],
            nextCursor: null,
          },
        },
      };
    });

    await useTenantChatStore.getState().loadMessages('conv-1', true);
    expect(loadingStateDuringFetch).toBe(false);
    expect(useTenantChatStore.getState().isLoadingMessages).toBe(false);
  });

  it('should ignore message.created echo if message is already present in store', () => {
    useTenantChatStore.setState({
      activeConversationId: 'conv-1',
      conversations: [mockConversation],
      messages: { 'conv-1': [mockMessage] },
    });

    const loadMessagesSpy = vi.spyOn(useTenantChatStore.getState(), 'loadMessages');

    useTenantChatStore.getState().handleRealtimeEvent({
      id: 'evt-2',
      type: 'message.created',
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: { messageId: 'msg-1' },
    });

    expect(loadMessagesSpy).not.toHaveBeenCalled();
    loadMessagesSpy.mockRestore();
  });
});

