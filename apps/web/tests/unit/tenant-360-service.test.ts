import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addTenantSupportNote, getTenant360 } from '@/services/tenant-360.service';
import { adminApiClient } from '@/lib/admin-api-client';

vi.mock('@/lib/admin-api-client', () => ({ adminApiClient: { get: vi.fn(), post: vi.fn() } }));

describe('Tenant 360 API client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the snapshot and safely encodes tenant identifiers', async () => {
    const data = { tenantId: 'tenant/one' };
    vi.mocked(adminApiClient.get).mockResolvedValue({ data: { data } });
    expect(await getTenant360('tenant/one')).toBe(data);
    expect(adminApiClient.get).toHaveBeenCalledWith('/api/admin/tenants/tenant%2Fone/360');
  });

  it('sends note content without a client-controlled admin identity', async () => {
    vi.mocked(adminApiClient.post).mockResolvedValue({ data: { data: { success: true } } });
    await addTenantSupportNote('tenant/one', 'Support note content', 'T-1');
    expect(adminApiClient.post).toHaveBeenCalledWith('/api/admin/tenants/tenant%2Fone/support-notes', {
      body: 'Support note content', ticketId: 'T-1',
    });
  });

  it('propagates failures so the UI cannot report a successful save', async () => {
    vi.mocked(adminApiClient.post).mockRejectedValue(new Error('Forbidden'));
    await expect(addTenantSupportNote('one', 'Support note content', '')).rejects.toThrow('Forbidden');
  });
});
