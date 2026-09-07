import type { AdminSecurityEventSummary, AdminSessionSummary } from '@repo/types';
import { adminApiClient } from '@/lib/admin-api-client';

export async function listAdminSessions(): Promise<AdminSessionSummary[]> {
  const response = await adminApiClient.get<{ data: AdminSessionSummary[] }>('/api/admin/auth/sessions');
  return response.data.data;
}
export async function listAdminSecurityEvents(): Promise<AdminSecurityEventSummary[]> {
  const response = await adminApiClient.get<{ data: AdminSecurityEventSummary[] }>('/api/admin/auth/security-events');
  return response.data.data;
}
export async function reauthenticateAdmin(password: string, otp: string): Promise<void> {
  await adminApiClient.post('/api/admin/auth/reauthenticate', { password, otp });
}
export async function closeAdminSession(id: string): Promise<void> {
  await adminApiClient.delete(`/api/admin/auth/sessions/${encodeURIComponent(id)}`);
}
export async function closeAllAdminSessions(): Promise<void> {
  await adminApiClient.post('/api/admin/auth/revoke-all');
}
