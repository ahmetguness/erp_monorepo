import { describe, expect, it } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { personalizeNavigation } from '../../src/features/navigation/personalize-navigation';
import type { NavigationWorkspace } from '../../src/features/navigation/navigation-workspace.service';
import type { NavGroup } from '../../src/lib/nav-config';

const groups: NavGroup[] = [{ label: 'Test', items: [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Satış', href: '/dashboard/sales-orders', icon: LayoutDashboard, module: 'sales' },
  { label: 'Stok', href: '/dashboard/products', icon: LayoutDashboard, module: 'inventory' },
] }];

function workspace(overrides: Partial<NavigationWorkspace> = {}): NavigationWorkspace {
  return { persona: 'SALES', effectivePersona: 'SALES', allowedModules: ['sales'], favoriteHrefs: [], hiddenModules: [], recentHrefs: [], usage: {}, goals: [], canDistributeProfiles: false, ...overrides };
}

describe('navigation personalization', () => {
  it('removes unauthorized and hidden modules instead of rendering locks', () => {
    const result = personalizeNavigation(groups, workspace({ hiddenModules: ['inventory'] }), 'PROFESSIONAL', []);
    expect(result[0]?.items.map((item) => item.label)).toEqual(['Dashboard', 'Satış']);
  });

  it('ranks favorites and frequently used destinations first', () => {
    const result = personalizeNavigation(groups, workspace({ allowedModules: '*', favoriteHrefs: ['/dashboard/products'], usage: { '/dashboard/sales-orders': 20 } }), 'PROFESSIONAL', []);
    expect(result[0]?.items[0]?.label).toBe('Stok');
  });
});
