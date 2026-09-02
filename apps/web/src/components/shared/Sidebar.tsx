'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LogOut, Search, Settings2, Star, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, type NavItem } from '@/lib/nav-config';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';
import { useUIStore } from '@/store/ui.store';
import { PLAN_RANK, type PlanName } from '@/lib/plans';
import { TenantLogo } from './TenantLogo';
import { findNavigationItems, personalizeNavigation, useNavigationWorkspace, useRecordNavigationActivity, useUpdateNavigationPreferences, type NavigationPersona, type NavigationWorkspace } from '@/features/navigation';

// ─────────────────────────────────────────────
// Nav item types — NavGroup burada tanımlanıyor
// ─────────────────────────────────────────────

type NavGroup = import('@/lib/nav-config').NavGroup;

// ─────────────────────────────────────────────
// Plan rank — yüksek rank düşük rank'ı kapsar
// ─────────────────────────────────────────────

const EMPTY_MODULES: string[] = [];

function isPlanName(plan: string): plan is PlanName {
  return plan in PLAN_RANK;
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
function isPathMatch(pathname: string, search: string, href: string): boolean {
  const [hrefPath, hrefQuery = ''] = href.split('?');
  const currentQuery = search.replace(/^\?/, '');
  const currentFullPath = currentQuery ? `${pathname}?${currentQuery}` : pathname;

  if (hrefQuery) return currentFullPath === href;
  if (pathname === hrefPath) {
    const querySpecificSibling = ALL_HREFS.some((other) => other !== href && other.startsWith(`${hrefPath}?`) && currentFullPath === other);
    return !querySpecificSibling;
  }
  if (hrefPath === '/dashboard') return false; // Dashboard sadece exact match

  // pathname bu href ile başlıyorsa VE daha spesifik bir href eşleşmiyorsa aktif
  if (pathname.startsWith(hrefPath + '/')) {
    // Daha spesifik bir href var mı kontrol et
    const hasMoreSpecific = ALL_HREFS.some(
      (other) => {
        const [otherPath] = other.split('?');
        return other !== href && otherPath.startsWith(hrefPath + '/') && (pathname === otherPath || pathname.startsWith(otherPath + '/'));
      },
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
  depth?: number;
  favoriteHrefs: readonly string[];
  onNavigate: (href: string) => void;
  onToggleFavorite: (href: string) => void;
}

function NavItemRow({ item, depth = 0, favoriteHrefs, onNavigate, onToggleFavorite }: NavItemProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const visibleChildren = item.children;

  const hasActiveChild = visibleChildren?.some((c) => isPathMatch(pathname, search, c.href)) ?? false;

  const [open, setOpen] = useState(() => {
    if (!visibleChildren) return false;
    return hasActiveChild;
  });

  useEffect(() => {
    if (!hasActiveChild) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasActiveChild]);

  const isActive = visibleChildren ? hasActiveChild : isPathMatch(pathname, search, item.href);

  const Icon = item.icon;

  // Has children → collapsible
  if (visibleChildren && visibleChildren.length > 0) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
            depth > 0 ? 'pl-8' : '',
            isActive ? 'bg-sky-500/10 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left truncate">{item.label}</span>
          <ChevronDown
            className={cn('w-3.5 h-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="mt-0.5 space-y-0.5">
            {visibleChildren.map((child) => (
              <NavItemRow
                key={`${child.href}-${child.label}`}
                item={child}
                depth={depth + 1}
                favoriteHrefs={favoriteHrefs}
                onNavigate={onNavigate}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Leaf item
  return (
    <div className="group/nav flex items-center">
      <Link
        href={item.href}
        onClick={() => onNavigate(item.href)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
          depth > 0 ? 'pl-8' : '',
          isActive ? 'bg-sky-500/10 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
      {(
        <button type="button" onClick={() => onToggleFavorite(item.href)} aria-label={`${item.label} favorisini değiştir`} className={cn('mr-1 rounded p-1 text-slate-600 hover:text-amber-300', favoriteHrefs.includes(item.href) ? 'text-amber-300' : 'opacity-0 group-hover/nav:opacity-100')}>
          <Star className="h-3.5 w-3.5" fill={favoriteHrefs.includes(item.href) ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
}

const PERSONA_LABELS: Record<NavigationPersona, string> = { AUTO: 'Otomatik', SALES: 'Satış', FINANCE: 'Finans', OPERATIONS: 'Operasyon', PEOPLE: 'İnsan & ekip', MANAGEMENT: 'Yönetim' };

function WorkspaceSettings({ workspace }: { workspace: NavigationWorkspace }) {
  const update = useUpdateNavigationPreferences();
  const modules = workspace.allowedModules === '*' ? ['sales', 'contacts', 'invoicing', 'inventory', 'purchasing', 'accounting', 'production', 'service', 'marketplace', 'hr', 'payroll', 'mail', 'reporting', 'approvals'] : workspace.allowedModules;
  function save(persona: NavigationPersona, hiddenModules: string[]) {
    update.mutate({ persona, hiddenModules, favoriteHrefs: workspace.favoriteHrefs });
  }
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800/60"><Settings2 className="h-3.5 w-3.5" /> Çalışma alanını düzenle</summary>
      <div className="mt-1 rounded-xl border border-slate-800 bg-slate-950 p-3">
        <label className="text-[10px] font-semibold uppercase text-slate-500">Çalışma biçimi</label>
        <select value={workspace.persona} onChange={(event) => save(event.target.value as NavigationPersona, workspace.hiddenModules)} className="mt-1 h-8 w-full rounded border border-slate-800 bg-slate-900 px-2 text-xs text-slate-200">
          {Object.entries(PERSONA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p className="mt-3 text-[10px] font-semibold uppercase text-slate-500">Gizlenebilir alanlar</p>
        <div className="mt-1 max-h-28 space-y-1 overflow-y-auto">
          {modules.map((module) => (
            <label key={module} className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={!workspace.hiddenModules.includes(module)} onChange={() => save(workspace.persona, workspace.hiddenModules.includes(module) ? workspace.hiddenModules.filter((item) => item !== module) : [...workspace.hiddenModules, module])} />
              {module}
            </label>
          ))}
        </div>
      </div>
    </details>
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
  const { data: workspace } = useNavigationWorkspace();
  const updateWorkspace = useUpdateNavigationPreferences();
  const recordActivity = useRecordNavigationActivity();
  const searchTerm = normalizeSearchText(menuSearch);
  const effectiveWorkspace = useMemo<NavigationWorkspace>(() => {
    if (workspace) return workspace;
    const membership = user?.tenantMembership;
    const allowedModules = membership?.isOwner
      ? '*'
      : [...new Set((membership?.role?.permissions ?? []).filter((permission) => permission.action === 'READ').map((permission) => permission.module))];
    return { persona: 'AUTO', effectivePersona: 'MANAGEMENT', allowedModules, favoriteHrefs: [], hiddenModules: [], recentHrefs: [], usage: {}, goals: [], canDistributeProfiles: false };
  }, [user?.tenantMembership, workspace]);
  const visibleGroups = useMemo(
    () =>
      personalizeNavigation(NAV_GROUPS, effectiveWorkspace, isPlanName(tenantPlan) ? tenantPlan : 'STARTER', tenantModules)
        .map((group) => ({ ...group, items: filterItemsBySearch(group.items, searchTerm) }))
        .filter((group) => group.items.length > 0),
    [effectiveWorkspace, searchTerm, tenantModules, tenantPlan],
  );

  const favoriteItems = useMemo(() => workspace ? findNavigationItems(visibleGroups, workspace.favoriteHrefs) : [], [visibleGroups, workspace]);
  function toggleFavorite(href: string) {
    if (!workspace) return;
    const favoriteHrefs = workspace.favoriteHrefs.includes(href) ? workspace.favoriteHrefs.filter((item) => item !== href) : [...workspace.favoriteHrefs, href];
    updateWorkspace.mutate({ persona: workspace.persona, hiddenModules: workspace.hiddenModules, favoriteHrefs });
  }
  function navigate(href: string) { recordActivity.mutate(href); }

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
        {workspace && workspace.goals.length > 0 && !searchTerm && (
          <div>
            <p className="px-3 mb-1 text-[10px] font-semibold text-violet-400 uppercase tracking-wider">İş hedefleri</p>
            <div className="space-y-0.5">{workspace.goals.map((goal) => <Link key={goal.id} href={goal.href} onClick={() => navigate(goal.href)} title={goal.description} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/10"><Zap className="h-4 w-4" />{goal.label}</Link>)}</div>
          </div>
        )}
        {favoriteItems.length > 0 && !searchTerm && (
          <div><p className="px-3 mb-1 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Favoriler</p><div className="space-y-0.5">{favoriteItems.map((item) => <NavItemRow key={`favorite-${item.href}`} item={item} favoriteHrefs={workspace?.favoriteHrefs ?? []} onNavigate={navigate} onToggleFavorite={toggleFavorite} />)}</div></div>
        )}
        {visibleGroups.map((group, gi) => (
          <div key={`${group.label ?? 'primary'}-${gi}`}>
            {group.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemRow key={`${item.href}-${item.label}`} item={item} favoriteHrefs={workspace?.favoriteHrefs ?? []} onNavigate={navigate} onToggleFavorite={toggleFavorite} />
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
        {workspace && <WorkspaceSettings workspace={workspace} />}
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
