import type { AdminUserSummary, InviteAdminInput, UpdateAdminInput } from '@repo/types';
import { adminApiClient } from '@/lib/admin-api-client';

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const response = await adminApiClient.get<{ data: AdminUserSummary[] }>('/api/admin/admin-users');
  return response.data.data;
}
export async function inviteAdminUser(input: InviteAdminInput): Promise<void> {
  await adminApiClient.post('/api/admin/admin-users/invite', input);
}
export async function updateAdminUser(id: string, input: UpdateAdminInput): Promise<void> {
  await adminApiClient.patch(`/api/admin/admin-users/${encodeURIComponent(id)}`, input);
}
export async function revokeAdminUserSessions(id: string): Promise<void> {
  await adminApiClient.post(`/api/admin/admin-users/${encodeURIComponent(id)}/revoke-sessions`);
}
export async function acceptAdminInvitation(token: string, password: string): Promise<void> {
  await adminApiClient.post('/api/admin/auth/accept-invitation', { token, password });
}
