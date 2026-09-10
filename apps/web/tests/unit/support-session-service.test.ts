import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportSessionSummary } from '@repo/types';
import { adminApiClient } from '@/lib/admin-api-client';
import { apiClient } from '@/lib/api-client';
import { decideSupportSession, readSupportRows, updateSupportContactNote } from '@/services/support-session.service';

vi.mock('@/lib/admin-api-client', () => ({ adminApiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

const session: SupportSessionSummary = {
  id: 'session-test', tenantId: 'tenant-test', adminId: 'admin-test', targetUserId: 'user-test',
  reason: 'Synthetic support test', ticketId: 'TEST-1', scopes: ['CONTACTS'], expiresAt: '2030-01-01T00:00:00.000Z',
  approvedAt: '2026-01-01T00:00:00.000Z', revokedAt: null, writeRequested: true, writeApprovedAt: null,
  admin: { name: 'Admin', email: 'admin@test.local' }, targetUser: { name: 'User', email: 'user@test.local' },
};

describe('Support session client isolation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses explicit per-request support headers on the existing tenant endpoint', async () => {
    vi.mocked(adminApiClient.get).mockResolvedValue({ data: { data: [{ id: 'one', name: 'Contact', notes: null }], meta: { totalPages: 1 } } });
    const rows = await readSupportRows(session, 'CONTACTS', 1);
    expect(rows.data[0]?.name).toBe('Contact');
    expect(adminApiClient.get).toHaveBeenCalledWith('/api/contacts', {
      headers: { 'X-Support-Session': session.id, 'X-Support-Tenant': session.tenantId }, params: { page: 1, limit: 20 },
    });
  });
  it('rejects malformed responses instead of displaying unvalidated records', async () => {
    vi.mocked(adminApiClient.get).mockResolvedValue({ data: { data: [{ password: 'not-a-record' }] } });
    await expect(readSupportRows(session, 'PRODUCTS', 1)).rejects.toThrow();
  });
  it('writes only notes and never accepts a client-supplied actor identity', async () => {
    vi.mocked(adminApiClient.patch).mockResolvedValue({ data: {} });
    await updateSupportContactNote(session, 'contact/1', 'Note');
    expect(adminApiClient.patch).toHaveBeenCalledWith('/api/contacts/contact%2F1', { notes: 'Note' }, {
      headers: { 'X-Support-Session': session.id, 'X-Support-Tenant': session.tenantId },
    });
  });
  it('requires owner credentials for consent, not the admin client', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    await decideSupportSession(session.id, 'approve-write');
    expect(apiClient.post).toHaveBeenCalledWith('/api/support-sessions/session-test/decision', { action: 'approve-write' });
    expect(adminApiClient.post).not.toHaveBeenCalled();
  });
});
