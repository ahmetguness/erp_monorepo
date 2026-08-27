import type { FeatureKey } from '../../../types/feature.types.js';
import type { Plan, TenantStatus } from '../../../types/plan.types.js';

export type PermissionAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'EXPORT';

export interface AccessPermission { module: string; action: PermissionAction }
export interface AccessMembership {
  id: string;
  roleId: string | null;
  roleName: string | null;
  isOwner: boolean;
  permissions: readonly AccessPermission[];
}
export interface ResolvedAccessFeature {
  value: string;
  isEnabled: boolean;
  source: 'override' | 'plan' | 'default';
}
export interface AccessContext {
  userId: string;
  tenantId: string;
  tenant: { plan: Plan; status: TenantStatus; modules: readonly string[] };
  membership: AccessMembership;
  features: ReadonlyMap<FeatureKey, ResolvedAccessFeature>;
  security: { ipRestrictionEnabled: boolean; ipWhitelist: readonly string[] };
}
export interface AccessContextResolution { context: AccessContext | null; queryCount: number }

export function hasAccessPermission(context: AccessContext, module: string, action: PermissionAction): boolean {
  return context.membership.isOwner || context.membership.permissions.some(
    (permission) => permission.module === module && permission.action === action,
  );
}

export function isAccessFeatureEnabled(context: AccessContext, featureKey: FeatureKey): boolean {
  return context.features.get(featureKey)?.isEnabled ?? false;
}
