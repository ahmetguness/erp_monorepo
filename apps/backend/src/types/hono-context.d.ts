import type { AdminPermission, AdminRoleKey } from '@repo/types';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    tenantId: string;
    adminId: string;
    adminEmail: string;
    adminRoles: AdminRoleKey[];
    adminPermissions: AdminPermission[];
    adminSessionId: string;
    adminMfaVerifiedAt: string;
  }
}

export {};
