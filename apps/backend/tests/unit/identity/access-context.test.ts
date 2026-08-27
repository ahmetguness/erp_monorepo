import { AppModule, FeatureKey, FeatureType, PermissionAction, Plan, TenantStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { AccessContext } from '../../../src/modules/identity/application/index.js';
import { hasAccessPermission, isAccessFeatureEnabled } from '../../../src/modules/identity/application/index.js';
import { resolveAccessFeatures } from '../../../src/modules/identity/infrastructure/index.js';

function context(isOwner = false): AccessContext {
  return {
    userId: 'user-1', tenantId: 'tenant-1',
    tenant: { plan: Plan.PROFESSIONAL, status: TenantStatus.ACTIVE, modules: [AppModule.ACCOUNTING] },
    membership: {
      id: 'membership-1', roleId: 'role-1', roleName: 'Accountant', isOwner,
      permissions: [{ module: 'accounting', action: PermissionAction.READ }],
    },
    features: new Map([[FeatureKey.API_ACCESS, { value: 'true', isEnabled: true, source: 'plan' }]]),
    security: { ipRestrictionEnabled: false, ipWhitelist: [] },
  };
}

describe('request access context', () => {
  it('uses the resolved permission collection without another query', () => {
    expect(hasAccessPermission(context(), 'accounting', PermissionAction.READ)).toBe(true);
    expect(hasAccessPermission(context(), 'accounting', PermissionAction.DELETE)).toBe(false);
    expect(hasAccessPermission(context(true), 'accounting', PermissionAction.DELETE)).toBe(true);
  });

  it('reads resolved feature values from the request context', () => {
    expect(isAccessFeatureEnabled(context(), FeatureKey.API_ACCESS)).toBe(true);
    expect(isAccessFeatureEnabled(context(), FeatureKey.AI_CHAT)).toBe(false);
  });

  it('keeps boolean override value semantics consistent with the legacy feature service', () => {
    const features = resolveAccessFeatures(
      [{ featureKey: FeatureKey.API_ACCESS, value: 'true', isEnabled: true, type: FeatureType.BOOLEAN }],
      [{ featureKey: FeatureKey.API_ACCESS, value: 'false', isEnabled: true }],
    );
    expect(features.get(FeatureKey.API_ACCESS)).toEqual({ value: 'false', isEnabled: false, source: 'override' });
  });

  it('uses the plan feature type when resolving non-boolean overrides', () => {
    const features = resolveAccessFeatures(
      [{ featureKey: FeatureKey.MAX_USERS, value: '5', isEnabled: true, type: FeatureType.LIMIT }],
      [{ featureKey: FeatureKey.MAX_USERS, value: '0', isEnabled: true }],
    );
    expect(features.get(FeatureKey.MAX_USERS)?.isEnabled).toBe(true);
  });
});
