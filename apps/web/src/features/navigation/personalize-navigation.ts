import type { NavGroup, NavItem } from '@/lib/nav-config';
import type { PlanName } from '@/lib/plans';
import { hasRequiredModule, hasRequiredPlan } from '@/lib/access-lock';
import type { NavigationWorkspace } from './navigation-workspace.service';

function canShow(item: NavItem, workspace: NavigationWorkspace, tenantPlan: PlanName, tenantModules: readonly string[]): boolean {
  if (item.plan && !hasRequiredPlan(tenantPlan, item.plan)) return false;
  if (item.module && workspace.hiddenModules.includes(item.module)) return false;
  if (item.module && workspace.allowedModules !== '*' && !workspace.allowedModules.includes(item.module)) return false;
  return !item.module || hasRequiredModule(tenantModules, item.module) || tenantModules.length === 0;
}

function score(item: NavItem, workspace: NavigationWorkspace): number {
  const own = (workspace.usage[item.href] ?? 0) + (workspace.favoriteHrefs.includes(item.href) ? 10_000 : 0);
  return own + Math.max(0, ...(item.children?.map((child) => score(child, workspace)) ?? [0]));
}

function filterItem(item: NavItem, workspace: NavigationWorkspace, tenantPlan: PlanName, tenantModules: readonly string[]): NavItem | null {
  const children = item.children?.map((child) => filterItem(child, workspace, tenantPlan, tenantModules)).filter((child): child is NavItem => child !== null);
  if (!canShow(item, workspace, tenantPlan, tenantModules) && (!children || children.length === 0)) return null;
  return children ? { ...item, children: children.sort((left, right) => score(right, workspace) - score(left, workspace)) } : item;
}

export function personalizeNavigation(groups: readonly NavGroup[], workspace: NavigationWorkspace, tenantPlan: PlanName, tenantModules: readonly string[]): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => filterItem(item, workspace, tenantPlan, tenantModules)).filter((item): item is NavItem => item !== null)
      .sort((left, right) => score(right, workspace) - score(left, workspace)),
  })).filter((group) => group.items.length > 0);
}

export function findNavigationItems(groups: readonly NavGroup[], hrefs: readonly string[]): NavItem[] {
  const wanted = new Set(hrefs);
  const found: NavItem[] = [];
  for (const group of groups) for (const item of group.items) {
    if (wanted.has(item.href)) found.push(item);
    for (const child of item.children ?? []) if (wanted.has(child.href)) found.push(child);
  }
  return found;
}
