'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
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

function hasPlanAccess(tenantPlan: string, requiredPlan?: string): boolean {
  if (!requiredPlan) return true;
  return (PLAN_RANK[tenantPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
}

function hasModuleAccess(tenantModules: string[], requiredModule?: string): boolean {
  if (!requiredModule) return true;           // modül kısıtı yok → her zaman görünür
  if (tenantModules.length === 0) return true; // boş liste → kısıtlama yok (legacy)
  return tenantModules.includes(requiredModule);
}

function hasAccess(tenantPlan: string, tenantModules: string[], item: { plan?: string; module?: string }): boolean {
  // Eğer modül listesi doluysa -> Kısıtlayıcı Model: SADECE listedeki modüller (ve modülsüzler) gösterilir
  if (tenantModules.length > 0) {
    if (!item.module) {
      // Dashboard, Rol Yönetimi, Ayarlar vb. modül bağımsızlar için planı yeterli mi kontrol et
      return hasPlanAccess(tenantPlan, item.plan);
    }
    // "warehouse" modülü açıldıysa nav-config'deki "inventory" menüsünün görünmesini sağla
    if (tenantModules.includes('warehouse') && item.module === 'inventory') return true;
    return tenantModules.includes(item.module);
  }

  // Eğer özel modül tanımlanmamışsa -> Normal Plan Kontrolü
  return hasPlanAccess(tenantPlan, item.plan);
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
}

function NavItemRow({ item, tenantPlan, tenantModules, depth = 0 }: NavItemProps) {
  const pathname = usePathname();

  if (!hasAccess(tenantPlan, tenantModules, item)) return null;

  const visibleChildren = item.children?.filter((c) => hasAccess(tenantPlan, tenantModules, c));

  const [open, setOpen] = useState(() => {
    if (!visibleChildren) return false;
    return visibleChildren.some((c) => isPathMatch(pathname, c.href));
  });

  const isActive = visibleChildren
    ? visibleChildren.some((c) => isPathMatch(pathname, c.href))
    : isPathMatch(pathname, item.href);

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
            isActive
              ? 'bg-sky-500/10 text-sky-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown
            className={cn('w-3.5 h-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="mt-0.5 space-y-0.5">
            {visibleChildren.map((child) => (
              <NavItemRow key={child.href} item={child} tenantPlan={tenantPlan} tenantModules={tenantModules} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Leaf item
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        depth > 0 ? 'pl-8' : '',
        isActive
          ? 'bg-sky-500/10 text-sky-400 font-medium'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
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
  const tenantModules = tenant?.modules ?? [];

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

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter((item) => hasAccess(tenantPlan, tenantModules, item));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavItemRow key={item.href} item={item} tenantPlan={tenantPlan} tenantModules={tenantModules} />
                ))}
              </div>
            </div>
          );
        })}
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
