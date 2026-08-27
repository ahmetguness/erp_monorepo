import type { AuthUser, TenantInfo } from '@repo/types';

export type AccessAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'EXPORT';

export interface UserAccessContext {
  userId: string;
  tenant: TenantInfo | null;
  isOwner: boolean;
  roleName: string | null;
  permissions: ReadonlyArray<{ module: string; action: string }>;
  legacyUnscoped: boolean;
}

export function createUserAccessContext(user: AuthUser | null, tenant: TenantInfo | null = null): UserAccessContext | null {
  if (!user) return null;
  const membership = user.tenantMembership;
  return {
    userId: user.id,
    tenant,
    isOwner: membership?.isOwner ?? false,
    roleName: membership?.role?.name ?? null,
    permissions: membership?.role?.permissions ?? [],
    legacyUnscoped: membership === undefined,
  };
}

export function hasUserPermission(context: UserAccessContext | null, module: string, action: AccessAction): boolean {
  if (!context) return false;
  return context.legacyUnscoped || context.isOwner || context.permissions.some(
    (permission) => permission.module === module && permission.action === action,
  );
}
