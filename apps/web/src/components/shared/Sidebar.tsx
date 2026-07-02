'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LogOut, Search, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, type NavItem } from '@/lib/nav-config';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';
import { useUIStore } from '@/store/ui.store';
import { TenantLogo } from './TenantLogo';

// ─────────────────────────────────────────────
// Nav item types — NavGroup burada tanımlanıyor
// ─────────────────────────────────────────────

type NavGroup = import('@/lib/nav-config').NavGroup;

// ─────────────────────────────────────────────
// Plan rank — yüksek rank düşük rank'ı kapsar
// ─────────────────────────────────────────────

const PLAN_RANK: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };
const EMPTY_MODULES: string[] = [];

function hasPlanAccess(tenantPlan: string, requiredPlan?: string): boolean {
  if (!requiredPlan) return true;
  return (PLAN_RANK[tenantPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
}

function hasModuleAccess(tenantModules: string[] | undefined | null, requiredModule?: string): boolean {
  if (!requiredModule) return true;
  if (!tenantModules || tenantModules.length === 0) return true;
  const normalized = tenantModules.map((m) => String(m).toLowerCase());
  const req = requiredModule.toLowerCase();
  if (req === 'sales') return normalized.includes('sales') || normalized.includes('invoicing') || normalized.includes('contacts');
  if (req === 'inventory') return normalized.includes('inventory') || normalized.includes('warehouse');
  if (req === 'mail') return normalized.includes('mail') || normalized.includes('mailcenter');
  return normalized.includes(req);
}

function hasAccess(tenantPlan: string, tenantModules: string[] | undefined | null, item: { plan?: string; module?: string }): boolean {
  const hasRequiredPlan = hasPlanAccess(tenantPlan, item.plan);
  if (!tenantModules || tenantModules.length === 0) return hasRequiredPlan;

  if (!item.module) {
    return hasRequiredPlan;
  }
  const hasRequiredModule = hasModuleAccess(tenantModules, item.module);
  return hasRequiredPlan && hasRequiredModule;
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase('tr-TR').trim();
}

function navItemMatches(item: NavItem, searchTerm: string): boolean {
  const searchableText = `${item.label} ${item.href}`;
  return normalizeSearchText(searchableText).includes(searchTerm);
}

function filterItemsBySearch(items: NavItem[], searchTerm: string): NavItem[] {
  if (!searchTerm) return items;

  return items.reduce<NavItem[]>((result, item) => {
    const matchingChildren = item.children?.filter((child) => navItemMatches(child, searchTerm)) ?? [];

    if (navItemMatches(item, searchTerm)) {
      result.push(item);
      return result;
    }

    if (matchingChildren.length > 0) {
      result.push({ ...item, children: matchingChildren });
    }

    return result;
  }, []);
}

// ─────────────────────────────────────────────
// Path matching — tüm nav href'lerini bilerek eşleştir
// ─────────────────────────────────────────────

/** Tüm leaf href'leri topla */
function collectAllHrefs(groups: NavGroup[]): string[] {
  const hrefs: string[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.children) {
        for (const child of item.children) hrefs.push(child.href);
      } else {
        hrefs.push(item.href);
      }
    }
  }
  return hrefs;
}

const ALL_HREFS = collectAllHrefs(NAV_GROUPS);

/**
 * Pathname'in belirli bir href ile eşleşip eşleşmediğini kontrol eder.
 * Exact match önceliklidir. startsWith sadece daha spesifik bir sibling yoksa kullanılır.
 */
function isPathMatch(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/dashboard') return false; // Dashboard sadece exact match

  // pathname bu href ile başlıyorsa VE daha spesifik bir href eşleşmiyorsa aktif
  if (pathname.startsWith(href + '/')) {
    // Daha spesifik bir href var mı kontrol et
    const hasMoreSpecific = ALL_HREFS.some(
      (other) => other !== href && other.startsWith(href + '/') && (pathname === other || pathname.startsWith(other + '/')),
    );
    return !hasMoreSpecific;
  }

  return false;
}

// ─────────────────────────────────────────────
// Nav item component
// ─────────────────────────────────────────────

interface NavItemProps {
  item: NavItem;
  tenantPlan: string;
  tenantModules: string[];
  depth?: number;
  parentLocked?: boolean;
  parentPlan?: string;
}

function NavItemRow({ item, tenantPlan, tenantModules, depth = 0, parentLocked = false, parentPlan }: NavItemProps) {
  const pathname = usePathname();

  const isLocked = parentLocked || Boolean(item.plan && !hasPlanAccess(tenantPlan, item.plan));
  const effectivePlan = item.plan || parentPlan || 'PROFESSIONAL';

  const visibleChildren = item.children?.filter((c) => {
    const isChildLocked = isLocked || Boolean(c.plan && !hasPlanAccess(tenantPlan, c.plan));
    return hasAccess(tenantPlan, tenantModules, c) || isChildLocked;
  });

  const hasActiveChild = visibleChildren?.some((c) => isPathMatch(pathname, c.href)) ?? false;

  const [open, setOpen] = useState(() => {
    if (!visibleChildren) return false;
    return hasActiveChild;
  });

  useEffect(() => {
    if (!hasActiveChild) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasActiveChild]);

  if (!hasAccess(tenantPlan, tenantModules, item) && !isLocked) return null;

  const isActive = visibleChildren ? hasActiveChild : isPathMatch(pathname, item.href);

  const Icon = item.icon;

  const href = isLocked
    ? `/dashboard/upgrade-preview?feature=${encodeURIComponent(item.label)}&plan=${effectivePlan}&module=${item.module || ''}`
    : item.href;

  // Has children → collapsible
  if (visibleChildren && visibleChildren.length > 0) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
            depth > 0 ? 'pl-8' : '',
            isActive
              ? 'bg-sky-500/10 text-sky-400 font-medium'
              : isLocked
              ? 'text-slate-500 hover:text-slate-400 hover:bg-slate-800/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
          )}
        >
          <Icon className={cn('w-4 h-4 shrink-0', isLocked && 'text-slate-600')} />
          <span className="flex-1 text-left truncate">{item.label}</span>
          {isLocked && <Lock className="w-3 h-3 text-slate-600 shrink-0 mr-1" />}
          <ChevronDown
            className={cn('w-3.5 h-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="mt-0.5 space-y-0.5">
            {visibleChildren.map((child) => (
              <NavItemRow
                key={child.href}
                item={child}
                tenantPlan={tenantPlan}
                tenantModules={tenantModules}
                depth={depth + 1}
                parentLocked={isLocked}
                parentPlan={effectivePlan}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Leaf item
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        depth > 0 ? 'pl-8' : '',
        isActive
          ? 'bg-sky-500/10 text-sky-400 font-medium'
          : isLocked
          ? 'text-slate-500 hover:text-slate-400 hover:bg-slate-800/20'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', isLocked && 'text-slate-600')} />
      <span className="flex-1 truncate">{item.label}</span>
      {isLocked && <Lock className="w-3 h-3 text-slate-600 shrink-0" />}
    </Link>
  );
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────

export function Sidebar() {
  const { user, tenant } = useCurrentUser();
  const logout = useLogout();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const tenantPlan = tenant?.plan ?? 'STARTER';
  const tenantModules = tenant?.modules ?? EMPTY_MODULES;
  const [menuSearch, setMenuSearch] = useState('');
  const searchTerm = normalizeSearchText(menuSearch);
  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => {
        const accessibleItems = group.items.reduce<NavItem[]>((items, item) => {
          const isItemLocked = Boolean(item.plan && !hasPlanAccess(tenantPlan, item.plan));
          if (!hasAccess(tenantPlan, tenantModules, item) && !isItemLocked) return items;

          if (item.children) {
            items.push({
              ...item,
              children: item.children.filter((child) => {
                const isChildLocked = isItemLocked || Boolean(child.plan && !hasPlanAccess(tenantPlan, child.plan));
                return hasAccess(tenantPlan, tenantModules, child) || isChildLocked;
              }),
            });
            return items;
          }

          items.push(item);
          return items;
        }, []);
        return { ...group, items: filterItemsBySearch(accessibleItems, searchTerm) };
      }).filter((group) => group.items.length > 0),
    [searchTerm, tenantModules, tenantPlan],
  );

  return (
    <aside
      className={cn(
        'flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 shrink-0',
        sidebarOpen ? 'w-56' : 'w-0 overflow-hidden',
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-slate-800 shrink-0">
        <TenantLogo className="w-8 h-8 rounded-lg shrink-0 mr-2" />
        <span className="text-base font-bold text-white tracking-tight truncate">
          {tenant?.companyName ?? 'Axon ERP'}
        </span>
        {tenant && (
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 uppercase tracking-wide">
            {tenant.plan}
          </span>
        )}
      </div>

      <div className="px-2 py-2 border-b border-slate-800/80 shrink-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={menuSearch}
            onChange={(event) => setMenuSearch(event.target.value)}
            placeholder="Menüde ara"
            className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950/70 pl-8 pr-3 text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500/70 focus:bg-slate-950"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {visibleGroups.map((group, gi) => (
          <div key={`${group.label ?? 'primary'}-${gi}`}>
            {group.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemRow key={item.href} item={item} tenantPlan={tenantPlan} tenantModules={tenantModules} />
              ))}
            </div>
          </div>
        ))}
        {visibleGroups.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-4 text-center text-xs text-slate-500">
            Sonuç bulunamadı.
          </div>
        )}
      </nav>

      {/* User + tenant info */}
      <div className="px-3 py-3 border-t border-slate-800 shrink-0">
        {user && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{tenant?.companyName ?? user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
