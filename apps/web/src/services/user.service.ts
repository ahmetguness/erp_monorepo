import { apiClient } from '@/lib/api-client';

export interface TenantUser {
  id: string;
  userId: string;
  tenantId: string;
  roleId: string | null;
  isOwner: boolean;
  isActive: boolean;
  user: { id: string; email: string; name: string; phone?: string | null; isActive: boolean };
  roleRef?: { id: string; name: string } | null;
}

export async function getTenantUsers(): Promise<TenantUser[]> {
  const res = await apiClient.get('/api/users');
  return res.data.data;
}

export async function updateUserRole(userId: string, roleId: string | null): Promise<void> {
  await apiClient.patch(`/api/users/${userId}`, { roleId });
}
