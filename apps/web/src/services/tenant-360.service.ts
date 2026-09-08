import type { Tenant360Snapshot } from '@repo/types';
import { adminApiClient } from '@/lib/admin-api-client';

export async function getTenant360(tenantId: string): Promise<Tenant360Snapshot> {
  const response = await adminApiClient.get<{ data: Tenant360Snapshot }>(`/api/admin/tenants/${encodeURIComponent(tenantId)}/360`);
  return response.data.data;
}
export async function addTenantSupportNote(tenantId: string, body: string, ticketId: string): Promise<void> {
  await adminApiClient.post(`/api/admin/tenants/${encodeURIComponent(tenantId)}/support-notes`, { body, ticketId });
}
