import { PermissionAction } from '@prisma/client';
import { prisma } from './prisma';

export interface TenantPermissionContext {
  roleId: string | null;
  isOwner: boolean;
  can(action: PermissionAction, module: string): boolean;
}

export async function getTenantPermissionContext(
  tenantId: string,
  userId: string,
): Promise<TenantPermissionContext | null> {
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true },
    select: {
      roleId: true,
      isOwner: true,
      roleRef: { select: { permissions: { select: { module: true, action: true } } } },
    },
  });

  if (!tenantUser) return null;

  return {
    roleId: tenantUser.roleId,
    isOwner: tenantUser.isOwner,
    can(action, module) {
      return tenantUser.isOwner ||
        (tenantUser.roleRef?.permissions.some((permission) => permission.module === module && permission.action === action) ?? false);
    },
  };
}
