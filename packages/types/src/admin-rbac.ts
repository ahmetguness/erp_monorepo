export const ADMIN_ROLE_KEYS = ['SUPER_ADMIN', 'SUPPORT', 'FINANCE', 'OPERATIONS', 'SECURITY', 'READ_ONLY_AUDITOR'] as const;
export type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

export const ADMIN_PERMISSIONS = [
  'dashboard.read', 'tenant.read', 'tenant.create', 'tenant.settings.update',
  'tenant.plan.update', 'tenant.status.update', 'feature.read', 'feature.update',
  'feature.override.create', 'feature.override.delete', 'operations.read', 'audit.read',
  'security.read', 'demo.read', 'demo.approve', 'demo.reject',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLE_PERMISSIONS = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  SUPPORT: ['dashboard.read', 'tenant.read', 'tenant.settings.update', 'feature.read', 'demo.read'],
  FINANCE: ['dashboard.read', 'tenant.read', 'tenant.plan.update', 'audit.read', 'demo.read'],
  OPERATIONS: ['dashboard.read', 'tenant.read', 'tenant.status.update', 'feature.read', 'operations.read', 'demo.read', 'demo.approve', 'demo.reject'],
  SECURITY: ['dashboard.read', 'tenant.read', 'operations.read', 'audit.read', 'security.read'],
  READ_ONLY_AUDITOR: ['dashboard.read', 'tenant.read', 'feature.read', 'operations.read', 'audit.read', 'security.read', 'demo.read'],
} as const satisfies Record<AdminRoleKey, readonly AdminPermission[]>;

export interface AdminIdentity {
  id: string; email: string; name: string; isActive: boolean;
  lastLoginAt: string | null; createdAt: string;
  roles: AdminRoleKey[]; permissions: AdminPermission[];
}

export function isAdminPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

export function hasAdminPermission(permissions: readonly AdminPermission[], permission: AdminPermission): boolean {
  return permissions.includes(permission);
}
