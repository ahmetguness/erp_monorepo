import { hasAdminPermission, type AdminIdentity, type AdminPermission } from '@repo/types';

export function canAdmin(admin: AdminIdentity | null, permission: AdminPermission): boolean {
  return admin !== null && hasAdminPermission(admin.permissions, permission);
}
