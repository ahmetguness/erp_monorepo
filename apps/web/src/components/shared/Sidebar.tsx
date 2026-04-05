'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, STARTER_MODULES, type NavItem } from '@/lib/nav-config';
import { useCurrentUser } from '@/hooks/useAuth';
import { useUIStore } from '@/store/ui.store';

// ─────────────────────────────────────────────
// Nav item component
// ─────────────────────────────────────────────

const PLAN_RANK: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };

interface NavItemProps {
  item: NavItem;
  tenantModules: string[];
  tenantPlan: string;
  depth?: number;
}

function NavItemRow({ item, tenantModules, tenantPlan, depth = 0 }: NavItemProps) {
  const pathname = usePathname();

  // Filter children by plan before rendering
  const visibleChildren = item.children?.filter((c) => {
    if (c.plan && (PLAN_RANK[tenantPlan] ?? 0) < (PLAN_RANK[c.plan] ?? 0)) return false;
    if (c.module && !STARTER_MODULES.has(c.module) && !tenantModules.includes(c.module)) return false;
    return true;
  });

  const [open, setOpen] = useState(() => {
    if (!visibleChildren) return false;
    return visibleChildren.some((c) => pathname.startsWith(c.href));
  });

  const isActive = visibleChildren
    ? visibleChildren.some((c) => pathname.startsWith(c.href))
    : pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

  // Module access check — kapalı modüller hiç gösterilmez
  const isLocked =
    item.module !== undefined &&
    !STARTER_MODULES.has(item.module) &&
    !tenantModules.includes(item.module);

  if (isLocked) return null;

  // Plan access check — düşük plan seviyesindeki özellikler gösterilmez
  if (item.plan && (PLAN_RANK[tenantPlan] ?? 0) < (PLAN_RANK[item.plan] ?? 0)) return null;

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
              <NavItemRow key={child.href} item={child} tenantModules={tenantModules} tenantPlan={tenantPlan} depth={depth + 1} />
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
  const { tenant } = useCurrentUser();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const tenantModules = tenant?.modules ?? [];
  const tenantPlan = tenant?.plan ?? 'STARTER';

  return (
    <aside
      className={cn(
        'flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 shrink-0',
        sidebarOpen ? 'w-56' : 'w-0 overflow-hidden',
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-slate-800 shrink-0">
        <span className="text-base font-bold text-white tracking-tight">
          Axon <span className="text-sky-400">ERP</span>
        </span>
        {tenant && (
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 uppercase tracking-wide">
            {tenant.plan}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemRow key={item.href} item={item} tenantModules={tenantModules} tenantPlan={tenantPlan} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Tenant info */}
      {tenant && (
        <div className="px-3 py-3 border-t border-slate-800 shrink-0">
          <p className="text-xs font-medium text-slate-300 truncate">{tenant.companyName}</p>
          <p className="text-[11px] text-slate-500 truncate">{tenant.slug}</p>
        </div>
      )}
    </aside>
  );
}
