import type { AdminPermission, AdminRoleKey } from '@repo/types';

export interface AdminAccessContext {
  adminId: string;
  adminEmail: string;
  adminRoles: AdminRoleKey[];
  adminPermissions: AdminPermission[];
}

export interface AdminJwtPayload { adminId: string; email: string; role: 'admin' }
