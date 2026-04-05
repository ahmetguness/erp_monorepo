import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

export const PermissionSchema = z.object({
  id: z.string(), roleId: z.string(), module: z.string(),
  action: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT']),
});

export const RoleSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(),
  description: z.string().nullable(), isSystem: z.boolean(),
  createdAt: z.string(), updatedAt: z.string(),
  permissions: z.array(PermissionSchema).optional(),
  _count: z.object({ users: z.coerce.number() }).optional(),
  users: z.array(z.object({
    user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  })).optional(),
});

export type Role = z.infer<typeof RoleSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type PermissionAction = Permission['action'];

export interface CreateRoleDTO { name: string; description?: string; permissions?: Array<{ module: string; action: PermissionAction }> }
export interface UpdateRoleDTO { name?: string; description?: string }
export interface AddPermissionDTO { module: string; action: PermissionAction }
export interface ListParams extends PaginationParams {}

export async function getRoles(params: ListParams) {
  const res = await apiClient.get('/api/roles', { params });
  return safeParse(PaginatedResponseSchema(RoleSchema), res.data, 'getRoles');
}
export async function getRoleById(id: string): Promise<Role> {
  const res = await apiClient.get(`/api/roles/${id}`);
  return safeParse(SingleResponseSchema(RoleSchema), res.data, 'getRoleById').data;
}
export async function createRole(data: CreateRoleDTO): Promise<Role> {
  const res = await apiClient.post('/api/roles', data);
  return safeParse(SingleResponseSchema(RoleSchema), res.data, 'createRole').data;
}
export async function updateRole(id: string, data: UpdateRoleDTO): Promise<Role> {
  const res = await apiClient.patch(`/api/roles/${id}`, data);
  return safeParse(SingleResponseSchema(RoleSchema), res.data, 'updateRole').data;
}
export async function deleteRole(id: string) { await apiClient.delete(`/api/roles/${id}`); }
export async function addPermission(roleId: string, data: AddPermissionDTO): Promise<Permission> {
  const res = await apiClient.post(`/api/roles/${roleId}/permissions`, data);
  return safeParse(SingleResponseSchema(PermissionSchema), res.data, 'addPermission').data;
}
export async function removePermission(roleId: string, permissionId: string) {
  await apiClient.delete(`/api/roles/${roleId}/permissions/${permissionId}`);
}
