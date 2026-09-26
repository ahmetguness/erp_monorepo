import { describe, expect, it, vi } from 'vitest';
import { assertGroupManager, assertMessageContent, assertMessageMutation } from '../../src/modules/collaboration/chat/domain/chat-policy.js';

describe('chat policy', () => {
  it('requires content or an attachment', () => {
    expect(() => assertMessageContent(null, 0)).toThrow('Mesaj metni veya eki zorunludur');
    expect(() => assertMessageContent('Merhaba', 0)).not.toThrow();
    expect(() => assertMessageContent(null, 1)).not.toThrow();
  });

  it('allows only group managers to manage members', () => {
    expect(() => assertGroupManager('OWNER')).not.toThrow();
    expect(() => assertGroupManager('ADMIN')).not.toThrow();
    expect(() => assertGroupManager('MEMBER')).toThrow('yönetici yetkisi');
  });

  it('enforces ownership and the edit window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'));
    expect(() => assertMessageMutation({ senderId: 'u1', actorId: 'u2', createdAt: new Date(), deletedAt: null })).toThrow('kendi mesajınızı');
    expect(() => assertMessageMutation({ senderId: 'u1', actorId: 'u1', createdAt: new Date('2026-09-25T09:40:00.000Z'), deletedAt: null })).toThrow('süresi doldu');
    expect(() => assertMessageMutation({ senderId: 'u1', actorId: 'u1', createdAt: new Date('2026-09-25T09:50:00.000Z'), deletedAt: null })).not.toThrow();
    vi.useRealTimers();
  });
});
