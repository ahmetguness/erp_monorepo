import { ADMIN_ROLE_KEYS, isAdminPermission, type AdminPermission, type AdminRoleKey } from '@repo/types';
import { prisma } from '../../../lib/prisma.js';

const ADMIN_ROLE_KEY_SET = new Set<string>(ADMIN_ROLE_KEYS);
function isAdminRoleKey(value: string): value is AdminRoleKey { return ADMIN_ROLE_KEY_SET.has(value); }

export interface ResolvedAdminAccess {
  id: string; email: string; name: string; isActive: boolean;
  lastLoginAt: Date | null; createdAt: Date;
  roles: AdminRoleKey[]; permissions: AdminPermission[];
}

export async function resolveAdminAccess(adminId: string): Promise<ResolvedAdminAccess | null> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: {
      id: true, email: true, name: true, isActive: true, lastLoginAt: true, createdAt: true,
      roleAssignments: { select: { adminRole: { select: {
        key: true,
        permissions: { select: { adminPermission: { select: { key: true } } } },
      } } } },
    },
  });
  if (!admin?.isActive) return null;
  const roles = admin.roleAssignments.map(({ adminRole }) => adminRole.key).filter(isAdminRoleKey);
  const permissions = Array.from(new Set(admin.roleAssignments.flatMap(({ adminRole }) =>
    adminRole.permissions.map(({ adminPermission }) => adminPermission.key),
  ).filter(isAdminPermission)));
  return { ...admin, roles, permissions };
}
