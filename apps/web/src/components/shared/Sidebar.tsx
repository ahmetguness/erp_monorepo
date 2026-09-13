'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LogOut, Search, Settings2, Star, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, type NavItem } from '@/lib/nav-config';
import { useCurrentUser, useLogout } from '@/hooks/useAuth';
import { useUIStore, type SidebarMode } from '@/store/ui.store';
import { PLAN_RANK, type PlanName } from '@/lib/plans';
import { TenantLogo } from './TenantLogo';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  findNavigationItems,
  personalizeNavigation,
  useNavigationWorkspace,
  useRecordNavigationActivity,
  useUpdateNavigationPreferences,
  type NavigationPersona,
  type NavigationWorkspace,
} from '@/features/navigation';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type NavGroup = import('@/lib/nav-config').NavGroup;

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const EMPTY_MODULES: string[] = [];

const NAVIGATION_MODULES = [
  'sales', 'contacts', 'invoicing', 'inventory', 'purchasing', 'accounting', 'production', 'service',
  'marketplace', 'hr', 'payroll', 'mail', 'reporting', 'approvals', 'workflow', 'documents', 'roles',
  'settings', 'operations', 'api_keys', 'ai_governance', 'holding',
] as const;

// ─────────────────────────────────────────────
// Permission helpers
// ─────────────────────────────────────────────

function expandNavigationPermission(module: string): string[] {
  if (module === 'settings') return [module, 'workflow'];
  if (module === 'attachments') return [module, 'documents'];
  return [module];
}

function isPlanName(plan: string): plan is PlanName {
  return plan in PLAN_RANK;
}


// ─────────────────────────────────────────────
// Path matching
// ─────────────────────────────────────────────

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

function isPathMatch(pathname: string, search: string, href: string): boolean {
  const [hrefPath, hrefQuery = ''] = href.split('?');
  const currentQuery = search.replace(/^\?/, '');
  const currentFullPath = currentQuery ? `${pathname}?${currentQuery}` : pathname;

  if (hrefQuery) return currentFullPath === href;
  if (pathname === hrefPath) {
    const querySpecificSibling = ALL_HREFS.some(
      (other) =>
        other !== href &&
        other.startsWith(`${hrefPath}?`) &&
        currentFullPath === other,
    );
    return !querySpecificSibling;
  }
  if (hrefPath === '/dashboard') return false;

  if (pathname.startsWith(hrefPath + '/')) {
    const hasMoreSpecific = ALL_HREFS.some((other) => {
      const [otherPath] = other.split('?');
      return (
        other !== href &&
        otherPath.startsWith(hrefPath + '/') &&
        (pathname === otherPath || pathname.startsWith(otherPath + '/'))
      );
    });
    return !hasMoreSpecific;
  }

  return false;
}

// ─────────────────────────────────────────────
// NavItemRow
// ─────────────────────────────────────────────

interface NavItemRowProps {
  item: NavItem;
  depth?: number;
  collapsed: boolean;
  favoriteHrefs: readonly string[];
  onNavigate: (href: string) => void;
  onToggleFavorite: (href: string) => void;
}

function NavItemRow({
  item,
  depth = 0,
  collapsed,
  favoriteHrefs,
  onNavigate,
  onToggleFavorite,
}: NavItemRowProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const visibleChildren = item.children;

  const hasActiveChild =
    visibleChildren?.some((c) => isPathMatch(pathname, search, c.href)) ?? false;

  const [open, setOpen] = useState(() => {
    if (!visibleChildren) return false;
    return hasActiveChild;
  });

  useEffect(() => {
    if (!hasActiveChild) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasActiveChild]);

  const isActive = visibleChildren
    ? hasActiveChild
    : isPathMatch(pathname, search, item.href);

  const Icon = item.icon;

  // ── Collapsed mode: icon-only, no children ──
  if (collapsed) {
    return (
      <Tooltip content={item.label} placement="right">
        <Link
          href={visibleChildren ? visibleChildren[0]?.href ?? item.href : item.href}
          onClick={() => onNavigate(item.href)}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-lg transition-colors mx-auto',
            isActive
              ? 'bg-sky-500/15 text-sky-400'
              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60',
          )}
          aria-label={item.label}
        >
          <Icon className="w-4 h-4 shrink-0" />
        </Link>
      </Tooltip>
    );
  }

  // ── Expanded: collapsible parent ──
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
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
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
                collapsed={collapsed}
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

  // ── Expanded: leaf item ──
  return (
    <div className="group/nav flex items-center">
      <Link
        href={item.href}
        onClick={() => onNavigate(item.href)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
          depth > 0 ? 'pl-8' : '',
          isActive
            ? 'bg-sky-500/10 text-sky-400 font-medium'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
      <button
        type="button"
        onClick={() => onToggleFavorite(item.href)}
        aria-label={`${item.label} favorisini değiştir`}
        title={favoriteHrefs.includes(item.href) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
        className={cn(
          'mr-1 rounded p-1 transition-all',
          favoriteHrefs.includes(item.href)
            ? 'text-amber-300 opacity-100'
            : 'text-slate-600 hover:text-amber-300 opacity-25 group-hover/nav:opacity-100 hover:scale-110',
        )}
      >
        <Star className="h-3.5 w-3.5" fill={favoriteHrefs.includes(item.href) ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Persona labels
// ─────────────────────────────────────────────

const PERSONA_LABELS: Record<NavigationPersona, string> = {
  AUTO: 'Otomatik',
  SALES: 'Satış',
  FINANCE: 'Finans',
  OPERATIONS: 'Operasyon',
  PEOPLE: 'İnsan & ekip',
  MANAGEMENT: 'Yönetim',
};

// ─────────────────────────────────────────────
// WorkspaceSettings (only shown in expanded mode)
// ─────────────────────────────────────────────

function WorkspaceSettings({ workspace }: { workspace: NavigationWorkspace }) {
  const update = useUpdateNavigationPreferences();
  const modules =
    workspace.allowedModules === '*' ? NAVIGATION_MODULES : workspace.allowedModules;

  function save(persona: NavigationPersona, hiddenModules: string[]): void {
    update.mutate({ persona, hiddenModules, favoriteHrefs: workspace.favoriteHrefs });
  }

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800/60">
        <Settings2 className="h-3.5 w-3.5" /> Çalışma alanını düzenle
      </summary>
      <div className="mt-1 rounded-xl border border-slate-800 bg-slate-950 p-3">
        <label className="text-[10px] font-semibold uppercase text-slate-500">
          Çalışma biçimi
        </label>
        <select
          value={workspace.persona}
          onChange={(event) =>
            save(event.target.value as NavigationPersona, workspace.hiddenModules)
          }
          className="mt-1 h-8 w-full rounded border border-slate-800 bg-slate-900 px-2 text-xs text-slate-200"
        >
          {Object.entries(PERSONA_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="mt-3 text-[10px] font-semibold uppercase text-slate-500">
          Gizlenebilir alanlar
        </p>
        <div className="mt-1 max-h-28 space-y-1 overflow-y-auto">
          {modules.map((module) => (
            <label key={module} className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={!workspace.hiddenModules.includes(module)}
                onChange={() =>
                  save(
                    workspace.persona,
                    workspace.hiddenModules.includes(module)
                      ? workspace.hiddenModules.filter((item) => item !== module)
                      : [...workspace.hiddenModules, module],
                  )
                }
              />
              {module}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────
// Sidebar width by mode
// ─────────────────────────────────────────────

const SIDEBAR_WIDTH: Record<SidebarMode, string> = {
  expanded:  'w-56',
  collapsed: 'w-14',
  hidden:    'w-0 overflow-hidden',
};

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────

export function Sidebar() {
  const { user, tenant } = useCurrentUser();
  const logout = useLogout();
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const tenantPlan = tenant?.plan ?? 'STARTER';
  const tenantModules = tenant?.modules ?? EMPTY_MODULES;
  const { data: workspace } = useNavigationWorkspace();
  const updateWorkspace = useUpdateNavigationPreferences();
  const recordActivity = useRecordNavigationActivity();

  const collapsed = sidebarMode === 'collapsed';

  const effectiveWorkspace = useMemo<NavigationWorkspace>(() => {
    if (workspace) return workspace;
    const membership = user?.tenantMembership;
    const allowedModules =
      membership?.isOwner
        ? '*'
        : [
            ...new Set(
              (membership?.role?.permissions ?? [])
                .filter((permission) => permission.action === 'READ')
                .flatMap((permission) => expandNavigationPermission(permission.module)),
            ),
          ];
    return {
      persona: 'AUTO',
      effectivePersona: 'MANAGEMENT',
      allowedModules,
      favoriteHrefs: [],
      hiddenModules: [],
      recentHrefs: [],
      usage: {},
      goals: [],
      canDistributeProfiles: false,
    };
  }, [user?.tenantMembership, workspace]);

  const visibleGroups = useMemo(
    () =>
      personalizeNavigation(
        NAV_GROUPS,
        effectiveWorkspace,
        isPlanName(tenantPlan) ? tenantPlan : 'STARTER',
        tenantModules,
      ).filter((group) => group.items.length > 0),
    [effectiveWorkspace, tenantModules, tenantPlan],
  );

  const favoriteItems = useMemo(
    () =>
      workspace ? findNavigationItems(visibleGroups, workspace.favoriteHrefs) : [],
    [visibleGroups, workspace],
  );

  function toggleFavorite(href: string): void {
    if (!workspace) return;
    const favoriteHrefs = workspace.favoriteHrefs.includes(href)
      ? workspace.favoriteHrefs.filter((item) => item !== href)
      : [...workspace.favoriteHrefs, href];
    updateWorkspace.mutate({
      persona: workspace.persona,
      hiddenModules: workspace.hiddenModules,
      favoriteHrefs,
    });
  }

  function navigate(href: string): void {
    recordActivity.mutate(href);
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-slate-900 border-r border-slate-800 transition-all duration-200 shrink-0',
        SIDEBAR_WIDTH[sidebarMode],
      )}
    >
      {/* ── Logo ── */}
      <div
        className={cn(
          'h-14 flex items-center border-b border-slate-800 shrink-0 overflow-hidden',
          collapsed ? 'justify-center px-0' : 'px-4',
        )}
      >
        <TenantLogo className="w-8 h-8 rounded-lg shrink-0" />
        {!collapsed && (
          <>
            <span className="ml-2 text-base font-bold text-white tracking-tight truncate">
              {tenant?.companyName ?? 'Axon ERP'}
            </span>
            {tenant && (
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 uppercase tracking-wide shrink-0">
                {tenant.plan}
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Search Trigger ── */}
      <div className={cn('py-2 border-b border-slate-800/80 shrink-0', collapsed ? 'px-1 flex justify-center' : 'px-2')}>
        {collapsed ? (
          <Tooltip content="Hızlı Ara (⌘K)" placement="right">
            <button
              onClick={openCommandPalette}
              aria-label="Hızlı Ara"
              className="w-10 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={openCommandPalette}
            className="w-full h-9 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-300 hover:bg-slate-950/90 transition-all group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-400 transition-colors shrink-0" />
              <span className="truncate">Hızlı Ara veya Komut...</span>
            </div>
            <kbd className="rounded border border-slate-800 bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 shrink-0 group-hover:border-slate-700">
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      {/* ── Nav ── */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-3 space-y-4',
          collapsed ? 'px-1' : 'px-2',
        )}
      >
        {/* Goals */}
        {workspace && workspace.goals.length > 0 && !collapsed && (
          <div>
            <p className="px-3 mb-1 text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
              İş hedefleri
            </p>
            <div className="space-y-0.5">
              {workspace.goals.map((goal) => (
                <Link
                  key={goal.id}
                  href={goal.href}
                  onClick={() => navigate(goal.href)}
                  title={goal.description}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/10"
                >
                  <Zap className="h-4 w-4" />
                  {goal.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Favorites */}
        {favoriteItems.length > 0 && !collapsed && (
          <div>
            <p className="px-3 mb-1 text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
              Favoriler
            </p>
            <div className="space-y-0.5">
              {favoriteItems.map((item) => (
                <NavItemRow
                  key={`favorite-${item.href}`}
                  item={item}
                  collapsed={collapsed}
                  favoriteHrefs={workspace?.favoriteHrefs ?? []}
                  onNavigate={navigate}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          </div>
        )}

        {/* Nav groups */}
        {visibleGroups.map((group, gi) => (
          <div key={`${group.label ?? 'primary'}-${gi}`}>
            {group.label && !collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
              {group.items.map((item) => (
                <NavItemRow
                  key={`${item.href}-${item.label}`}
                  item={item}
                  collapsed={collapsed}
                  favoriteHrefs={workspace?.favoriteHrefs ?? []}
                  onNavigate={navigate}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          </div>
        ))}

        {visibleGroups.length === 0 && !collapsed && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-4 text-center text-xs text-slate-500">
            Sonuç bulunamadı.
          </div>
        )}
      </nav>

      {/* ── Footer ── */}
      <div className={cn('border-t border-slate-800 shrink-0', collapsed ? 'px-1 py-2' : 'px-3 py-3')}>
        {/* Workspace settings (expanded only) */}
        {!collapsed && workspace && <WorkspaceSettings workspace={workspace} />}

        {/* User info */}
        {!collapsed && user && (
          <div className="flex items-center gap-2 mb-2 mt-1">
            <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate">
                {tenant?.companyName ?? user.email}
              </p>
            </div>
          </div>
        )}

        {/* Logout */}
        <Tooltip content="Çıkış Yap" placement="right" disabled={!collapsed}>
          <button
            onClick={logout}
            aria-label="Çıkış Yap"
            className={cn(
              'flex items-center gap-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-colors',
              collapsed
                ? 'w-9 h-9 justify-center mx-auto'
                : 'w-full px-2 py-1.5',
            )}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && 'Çıkış Yap'}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
