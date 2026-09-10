import { z } from 'zod';
import type { CreateSupportSessionInput, SupportScope, SupportSessionSummary } from '@repo/types';
import { adminApiClient } from '@/lib/admin-api-client';
import { apiClient } from '@/lib/api-client';

export async function listAdminSupportSessions(tenantId: string): Promise<SupportSessionSummary[]> {
  const response = await adminApiClient.get<{ data: SupportSessionSummary[] }>(`/api/admin/tenants/${encodeURIComponent(tenantId)}/support-sessions`);
  return response.data.data;
}
export async function listSupportTargets(tenantId: string): Promise<Array<{ id: string; name: string; email: string }>> {
  const response = await adminApiClient.get<{ data: Array<{ id: string; name: string; email: string }> }>(`/api/admin/tenants/${encodeURIComponent(tenantId)}/support-targets`);
  return response.data.data;
}
export async function requestSupportSession(input: CreateSupportSessionInput): Promise<void> {
  await adminApiClient.post('/api/admin/support-sessions', input);
}
export async function endSupportSession(tenantId: string, id: string): Promise<void> {
  await adminApiClient.post(`/api/admin/tenants/${encodeURIComponent(tenantId)}/support-sessions/${encodeURIComponent(id)}/revoke`);
}
export async function listOwnerSupportSessions(): Promise<SupportSessionSummary[]> {
  const response = await apiClient.get<{ data: SupportSessionSummary[] }>('/api/support-sessions');
  return response.data.data;
}
export async function decideSupportSession(id: string, action: 'approve' | 'approve-write' | 'revoke'): Promise<void> {
  await apiClient.post(`/api/support-sessions/${encodeURIComponent(id)}/decision`, { action });
}

const supportRowsSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string(), code: z.string().nullable().optional(), notes: z.string().nullable().optional() })),
  meta: z.object({ totalPages: z.number() }),
});
export type SupportRows = z.infer<typeof supportRowsSchema>;
function supportHeaders(session: SupportSessionSummary): Record<string, string> {
  return { 'X-Support-Session': session.id, 'X-Support-Tenant': session.tenantId };
}
export async function readSupportRows(session: SupportSessionSummary, scope: SupportScope, page: number): Promise<SupportRows> {
  const response = await adminApiClient.get<unknown>(scope === 'PRODUCTS' ? '/api/products' : '/api/contacts', {
    headers: supportHeaders(session), params: { page, limit: 20 },
  });
  return supportRowsSchema.parse(response.data);
}
export async function updateSupportContactNote(session: SupportSessionSummary, contactId: string, notes: string): Promise<void> {
  await adminApiClient.patch(`/api/contacts/${encodeURIComponent(contactId)}`, { notes }, { headers: supportHeaders(session) });
}
