import { afterEach, expect, it, vi } from 'vitest';
import { Plan, TenantStatus, type AuthUser, type TenantInfo } from '@repo/types';
import { useAuthStore } from '@/store/auth.store';
import { tenantSessionRevision } from '@/lib/http/tenant-session';
const user: AuthUser = { id: 'synthetic-user', email: 'user@example.test', name: 'Synthetic user', phone: null, isActive: true };
const tenant: TenantInfo = { id: 'synthetic-tenant', slug: 'synthetic', companyName: 'Synthetic', plan: Plan.ENTERPRISE, status: TenantStatus.ACTIVE, modules: [] };
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout(); });
it('advances for same-user reauthentication and A→B→A, while ordinary server synchronization stays stable', () => {
  useAuthStore.getState().login(user, tenant);
  const first = tenantSessionRevision();
  useAuthStore.getState().syncFromServer({ ...user }, { ...tenant });
  expect(tenantSessionRevision()).toBe(first);
  useAuthStore.getState().login(user, tenant);
  expect(tenantSessionRevision()).toBeGreaterThan(first);
  const beforeSwitch = tenantSessionRevision();
  useAuthStore.getState().syncFromServer(user, { ...tenant, id: 'other-tenant' });
  useAuthStore.getState().syncFromServer(user, tenant);
  expect(tenantSessionRevision()).toBe(beforeSwitch + 2);
});
it('keeps authentication usable when legacy browser storage access is denied', () => {
  vi.stubGlobal('window', { localStorage: { removeItem: () => { throw new Error('Storage denied'); } } });
  expect(() => useAuthStore.getState().login(user, tenant)).not.toThrow();
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
});
