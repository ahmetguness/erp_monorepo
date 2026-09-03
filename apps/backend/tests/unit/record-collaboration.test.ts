import { describe, expect, it, vi } from 'vitest';
import { RecordCollaborationService, type RecordCollaborationRepository } from '../../src/modules/collaboration/application/index.js';
import { parseCreateEntryBody, parseEntityType } from '../../src/modules/collaboration/http/record-collaboration.schemas.js';

function repository(overrides: Partial<RecordCollaborationRepository> = {}): RecordCollaborationRepository {
  return {
    recordExists: async () => true,
    getSnapshot: async () => ({ entries: [], followers: [], isFollowing: false, mentionCandidates: [] }),
    createEntry: async (input) => ({ id: 'entry-1', type: input.type, content: input.content, mentionIds: input.mentionIds, externalId: input.externalId ?? null, actor: { id: input.userId, name: 'Test User', email: 'test@example.com' }, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }),
    setFollowing: async (_tenantId, _userId, _entityType, _entityId, following) => following,
    findActiveTenantUsers: async (_tenantId, userIds) => userIds.map((id) => ({ id, name: id, email: `${id}@example.com` })),
    getFollowerUserIds: async () => [],
    notifyUsers: async () => undefined,
    ...overrides,
  };
}

describe('record collaboration', () => {
  it('normalizes mentions and notifies mentioned users plus followers once', async () => {
    const notifyUsers = vi.fn<RecordCollaborationRepository['notifyUsers']>();
    const service = new RecordCollaborationService(repository({ getFollowerUserIds: async () => ['follower', 'mentioned'], notifyUsers }));
    const entry = await service.createEntry({ tenantId: 'tenant-1', userId: 'author', entityType: 'INVOICE', entityId: 'invoice-1', type: 'DECISION', content: '  Tahsilat yarın yapılacak.  ', mentionIds: ['mentioned', 'mentioned'] });
    expect(entry.content).toBe('Tahsilat yarın yapılacak.');
    expect(notifyUsers).toHaveBeenCalledWith('tenant-1', ['mentioned', 'follower'], expect.any(String), entry.content, 'INVOICE', 'invoice-1');
  });

  it('rejects foreign or inactive mention identities', async () => {
    const service = new RecordCollaborationService(repository({ findActiveTenantUsers: async () => [] }));
    await expect(service.createEntry({ tenantId: 'tenant-1', userId: 'author', entityType: 'CONTACT', entityId: 'contact-1', type: 'COMMENT', content: 'Kontrol eder misin?', mentionIds: ['foreign-user'] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('validates HTTP contract without unsafe coercion', () => {
    expect(parseEntityType('SALES_ORDER')).toBe('SALES_ORDER');
    expect(parseCreateEntryBody({ type: 'COMMENT', content: 'Merhaba', mentionIds: ['user-1'] })).toEqual({ type: 'COMMENT', content: 'Merhaba', mentionIds: ['user-1'] });
    expect(() => parseEntityType('TENANT')).toThrow();
  });
});
