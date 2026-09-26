import { describe, expect, it } from 'vitest';
import { SendChatMessageSchema, ChatRealtimeEventSchema } from '@repo/types/chat';

describe('chat contracts', () => {
  it('rejects empty and untyped message payloads', () => {
    expect(SendChatMessageSchema.safeParse({ clientMessageId: crypto.randomUUID(), content: null, attachmentIds: [], mentionUserIds: [] }).success).toBe(false);
    expect(SendChatMessageSchema.safeParse({ clientMessageId: crypto.randomUUID(), content: 'Merhaba', attachmentIds: [], mentionUserIds: [] }).success).toBe(true);
  });

  it('keeps realtime events versioned and typed', () => {
    expect(ChatRealtimeEventSchema.safeParse({ id: 'e1', type: 'message.created', tenantId: 't1', conversationId: 'c1', occurredAt: new Date().toISOString(), version: 1, payload: { messageId: 'm1' } }).success).toBe(true);
    expect(ChatRealtimeEventSchema.safeParse({ id: 'e1', type: 'unknown', tenantId: 't1', conversationId: 'c1', occurredAt: new Date().toISOString(), version: 2, payload: {} }).success).toBe(false);
  });
});
