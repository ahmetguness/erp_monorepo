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

export interface CreateTenantUserDTO {
  email: string;
  name: string;
  password: string;
  phone?: string;
  roleId?: string;
}

export interface UpdateTenantUserDTO {
  name?: string;
  phone?: string;
  isActive?: boolean;
  roleId?: string | null;
}

export async function getTenantUsers(): Promise<TenantUser[]> {
  const res = await apiClient.get('/api/users');
  return res.data.data;
}

export async function getTenantUserById(userId: string): Promise<TenantUser> {
  const res = await apiClient.get(`/api/users/${userId}`);
  return res.data.data;
}

export async function createTenantUser(data: CreateTenantUserDTO): Promise<TenantUser> {
  const res = await apiClient.post('/api/users', data);
  return res.data.data;
}

export async function updateTenantUser(userId: string, data: UpdateTenantUserDTO): Promise<TenantUser['user']> {
  const res = await apiClient.patch(`/api/users/${userId}`, data);
  return res.data.data;
}

export async function updateUserRole(userId: string, roleId: string | null): Promise<void> {
  await apiClient.patch(`/api/users/${userId}`, { roleId });
}

export async function deleteTenantUser(userId: string): Promise<void> {
  await apiClient.delete(`/api/users/${userId}`);
}
