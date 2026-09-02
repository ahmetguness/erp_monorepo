import { describe, expect, it, vi } from 'vitest';
import type { NavigationMember, NavigationWorkspaceRepository } from '../../src/modules/platform/application/navigation-workspace/navigation-workspace.ports.js';
import { NavigationWorkspaceService } from '../../src/modules/platform/application/navigation-workspace/navigation-workspace.service.js';

function member(overrides: Partial<NavigationMember> = {}): NavigationMember {
  return { tenantId: 'tenant-1', userId: 'user-1', roleId: 'role-1', isOwner: false, allowedModules: ['sales', 'invoicing'], preferences: { persona: 'AUTO', favoriteHrefs: [], hiddenModules: [], recentHrefs: [], usage: {} }, ...overrides };
}

function setup(current: NavigationMember | null = member()) {
  const repository: NavigationWorkspaceRepository = {
    findMember: vi.fn(async () => current),
    savePreferences: vi.fn(async () => undefined),
    distributeRoleProfile: vi.fn(async () => 2),
  };
  return { service: new NavigationWorkspaceService(repository), repository };
}

describe('navigation workspace', () => {
  it('derives a focused persona and goals from readable modules', async () => {
    const result = await setup().service.get('tenant-1', 'user-1');
    expect('kind' in result).toBe(false);
    if ('kind' in result) return;
    expect(result.effectivePersona).toBe('SALES');
    expect(result.goals.some((goal) => goal.id === 'sell')).toBe(true);
    expect(result.allowedModules).toEqual(['sales', 'invoicing']);
  });

  it('sanitizes preferences and records bounded usage', async () => {
    const { service, repository } = setup();
    await service.update('tenant-1', 'user-1', { persona: 'FINANCE', favoriteHrefs: ['/dashboard', '/external'], hiddenModules: ['sales', 'unknown'] });
    expect(repository.savePreferences).toHaveBeenCalledWith('tenant-1', 'user-1', expect.objectContaining({ favoriteHrefs: ['/dashboard'], hiddenModules: ['sales'] }));
    await service.recordActivity('tenant-1', 'user-1', '/dashboard/sales-orders/quotes?tab=open');
    expect(repository.savePreferences).toHaveBeenLastCalledWith('tenant-1', 'user-1', expect.objectContaining({ recentHrefs: ['/dashboard/sales-orders/quotes'] }));
  });

  it('allows only the tenant owner to distribute a role profile', async () => {
    await expect(setup().service.distribute('tenant-1', 'user-1', 'role-1', { persona: 'AUTO', favoriteHrefs: [], hiddenModules: [] })).resolves.toMatchObject({ kind: 'FORBIDDEN' });
    const owner = setup(member({ isOwner: true }));
    await expect(owner.service.distribute('tenant-1', 'user-1', 'role-1', { persona: 'OPERATIONS', favoriteHrefs: [], hiddenModules: [] })).resolves.toEqual({ updatedUsers: 2 });
  });
});
