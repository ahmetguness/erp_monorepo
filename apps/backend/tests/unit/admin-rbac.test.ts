import { describe, expect, it } from 'vitest';
import { ADMIN_PERMISSIONS, ADMIN_ROLE_PERMISSIONS } from '@repo/types';
import { isCriticalTenantPlanChange, isCriticalTenantStatusChange } from '../../src/modules/platform/admin-change-request/admin-change-request.policy.js';

describe('admin RBAC matrix', () => {
  it('grants every permission only to the super admin role', () => {
    expect(ADMIN_ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(ADMIN_PERMISSIONS);
  });

  it('requires approval for Enterprise and destructive tenant changes', () => {
    expect(isCriticalTenantPlanChange('STARTER', 'ENTERPRISE')).toBe(true);
    expect(isCriticalTenantPlanChange('ENTERPRISE', 'PROFESSIONAL')).toBe(true);
    expect(isCriticalTenantPlanChange('STARTER', 'PROFESSIONAL')).toBe(false);
    expect(isCriticalTenantStatusChange('SUSPENDED')).toBe(true);
    expect(isCriticalTenantStatusChange('CANCELLED')).toBe(true);
    expect(isCriticalTenantStatusChange('ACTIVE')).toBe(false);
  });

  it('assigns approval permissions only to intended operational roles', () => {
    expect(ADMIN_ROLE_PERMISSIONS.FINANCE).toContain('tenant.plan.approve');
    expect(ADMIN_ROLE_PERMISSIONS.FINANCE).not.toContain('tenant.status.approve');
    expect(ADMIN_ROLE_PERMISSIONS.OPERATIONS).toContain('tenant.status.approve');
    expect(ADMIN_ROLE_PERMISSIONS.OPERATIONS).not.toContain('tenant.plan.approve');
    expect(ADMIN_ROLE_PERMISSIONS.READ_ONLY_AUDITOR).not.toContain('change-request.reject');
  });

  it('keeps the read-only auditor free of mutation permissions', () => {
    expect(ADMIN_ROLE_PERMISSIONS.READ_ONLY_AUDITOR.every((permission) => permission.endsWith('.read'))).toBe(true);
  });

  it('separates finance, operations and security responsibilities', () => {
    expect(ADMIN_ROLE_PERMISSIONS.FINANCE).toContain('tenant.plan.update');
    expect(ADMIN_ROLE_PERMISSIONS.FINANCE).not.toContain('tenant.status.update');
    expect(ADMIN_ROLE_PERMISSIONS.OPERATIONS).toContain('tenant.status.update');
    expect(ADMIN_ROLE_PERMISSIONS.OPERATIONS).not.toContain('tenant.plan.update');
    expect(ADMIN_ROLE_PERMISSIONS.SECURITY).toContain('security.read');
  });
});
