import type { AdminPermission, AdminRoleKey } from '@repo/types';

declare module 'hono' {
  interface ContextVariableMap {
    adminId: string;
    adminEmail: string;
    adminRoles: AdminRoleKey[];
    adminPermissions: AdminPermission[];
    adminSessionId: string;
    adminMfaVerifiedAt: string;
  }
}

export {};
