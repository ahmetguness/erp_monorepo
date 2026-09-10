import type { TenantLifecycleInput, TenantLifecycleSnapshot } from '@repo/types';
import { adminApiClient } from '@/lib/admin-api-client';

const base = (id: string) => `/api/admin/tenants/${encodeURIComponent(id)}/lifecycle`;
export async function getTenantLifecycle(id: string): Promise<TenantLifecycleSnapshot> {
  const response = await adminApiClient.get<{ data: TenantLifecycleSnapshot }>(base(id));
  return response.data.data;
}
export async function requestTenantLifecycle(id: string, input: TenantLifecycleInput): Promise<void> {
  await adminApiClient.post(`${base(id)}/requests`, input);
}
export async function decideTenantLifecycle(id: string, requestId: string, decision: 'approve' | 'reject'): Promise<void> {
  await adminApiClient.post(`${base(id)}/requests/${encodeURIComponent(requestId)}/decision`, { decision });
}
export async function exportTenantLifecycle(id: string): Promise<{ id: string; digest: string; data: unknown }> {
  const response = await adminApiClient.post<{ data: { id: string; digest: string; data: unknown } }>(`${base(id)}/export`, undefined, { timeout: 70000 });
  return response.data.data;
}
