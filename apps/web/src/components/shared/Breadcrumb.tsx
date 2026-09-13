'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { NAV_GROUPS, type NavItem } from '@/lib/nav-config';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// ─────────────────────────────────────────────
// Route label mappings & helpers
// ─────────────────────────────────────────────

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  new: 'Yeni',
  edit: 'Düzenle',
  details: 'Detay',
  quotes: 'Teklifler',
  settings: 'Ayarlar',
  profile: 'Profil',
};

function findNavItemByHref(href: string): { parent?: NavItem; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href === href) {
        return { item };
      }
      if (item.children) {
        for (const child of item.children) {
          if (child.href === href) {
            return { parent: item, item: child };
          }
        }
      }
    }
  }
  return null;
}

export function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  if (!pathname || pathname === '/' || pathname === '/dashboard') {
    return [{ label: 'Dashboard', href: '/dashboard' }];
  }

  const result: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/dashboard' }];

  // 1. Check exact match in navigation config
  const navMatch = findNavItemByHref(pathname);
  if (navMatch) {
    if (navMatch.parent && navMatch.parent.href !== navMatch.item.href) {
      result.push({ label: navMatch.parent.label, href: navMatch.parent.href });
    }
    result.push({ label: navMatch.item.label, href: navMatch.item.href });
    return result;
  }

  // 2. Dynamic traversal of path segments
  const cleanPath = pathname.replace(/^\//, '');
  const segments = cleanPath.split('/').filter(Boolean);

  let accumulatedPath = '';
  // Skip the first segment if it's "dashboard" since it's already in result
  const startIndex = segments[0] === 'dashboard' ? 1 : 0;
  accumulatedPath = segments[0] === 'dashboard' ? '/dashboard' : '';

  for (let i = startIndex; i < segments.length; i++) {
    const segment = segments[i];
    accumulatedPath += `/${segment}`;

    const match = findNavItemByHref(accumulatedPath);
    if (match) {
      if (match.parent && !result.some((r) => r.label === match.parent?.label)) {
        result.push({ label: match.parent.label, href: match.parent.href });
      }
      result.push({ label: match.item.label, href: accumulatedPath });
    } else {
      const fallbackLabel =
        SEGMENT_LABELS[segment] ??
        (segment.length > 20
          ? `${segment.slice(0, 8)}...`
          : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '));

      result.push({
        label: fallbackLabel,
        href: i === segments.length - 1 ? undefined : accumulatedPath,
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function Breadcrumb() {
  const pathname = usePathname();
  const items = generateBreadcrumbs(pathname);

  // If only dashboard on dashboard page, show simple indicator
  if (items.length <= 1) {
    return (
      <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400">
        <Home className="w-3.5 h-3.5 text-slate-500" />
        <span className="font-medium text-slate-300">Dashboard</span>
      </div>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1 text-xs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" aria-hidden="true" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-slate-400 hover:text-slate-200 transition-colors truncate max-w-[140px]"
              >
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-slate-200 truncate max-w-[180px]">
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
