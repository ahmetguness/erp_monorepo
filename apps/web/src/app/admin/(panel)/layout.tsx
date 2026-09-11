'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  LayoutDashboard,
  Building2,
  Sliders,
  Activity,
  FileText,
  LogOut,
  ShieldCheck,
  UserRoundCheck,
  KeyRound,
  ChevronRight,
  ExternalLink,
  Ticket,
  LifeBuoy,
  DatabaseBackup,
} from 'lucide-react';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { cn } from '@/lib/utils';
import { ToastContainer } from '@/components/ui/Toast';
import { AdminSecurityNotice } from '@/components/features/admin/AdminSecurityNotice';
import type { AdminPermission } from '@repo/types';
import { canAdmin } from '@/lib/admin/permissions';
import { getAdminChangeRequests } from '@/services/admin.service';
import { listAdminTickets } from '@/services/support-ticket.service';

interface NavItemConfig {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  permission: AdminPermission;
  badgeKey?: 'changeRequests' | 'supportTickets';
}

const NAV_GROUPS: Array<{
  groupLabel?: string;
  items: NavItemConfig[];
}> = [
  {
    groupLabel: 'Genel',
    items: [
      { href: '/admin', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.read' },
      { href: '/admin/tenants', icon: Building2, label: 'Tenantlar', permission: 'tenant.read' },
      {
        href: '/admin/tickets',
        icon: LifeBuoy,
        label: 'Destek Talepleri',
        permission: 'support-ticket.read',
        badgeKey: 'supportTickets',
      },
      { href: '/admin/support', icon: KeyRound, label: 'Destek Oturumları', permission: 'support-session.manage' },
      {
        href: '/admin/change-requests',
        icon: UserRoundCheck,
        label: 'Onay Talepleri',
        permission: 'change-request.read',
        badgeKey: 'changeRequests',
      },
    ],
  },
  {
    groupLabel: 'Konfigürasyon & Sistem',
    items: [
      { href: '/admin/features', icon: Sliders, label: 'Özellikler & Plan', permission: 'feature.read' },
      { href: '/admin/coupons', icon: Ticket, label: 'Kupon Yönetimi', permission: 'tenant.plan.update' },
      { href: '/admin/observability', icon: Activity, label: 'Operasyon & Telemetri', permission: 'operations.read' },
      { href: '/admin/disaster-recovery', icon: DatabaseBackup, label: 'Yedekleme & Kurtarma', permission: 'operations.read' },
      { href: '/admin/audit', icon: FileText, label: 'Denetim Günlüğü', permission: 'audit.read' },
    ],
  },
  {
    groupLabel: 'Erişim & Güvenlik',
    items: [
      { href: '/admin/admin-users', icon: UserRoundCheck, label: 'Admin Kullanıcıları', permission: 'admin-user.read' },
      { href: '/admin/security', icon: ShieldCheck, label: 'Güvenlik & Checklist', permission: 'security.read' },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function permissionForPath(pathname: string): AdminPermission | null {
  return (
    ALL_NAV_ITEMS.find((item) => (item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)))
      ?.permission ?? null
  );
}

function AdminNavLinks({ pathname }: { pathname: string }) {
  const admin = useAdminAuthStore((state) => state.admin);

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['admin', 'change-requests', 'pending'],
    queryFn: () => getAdminChangeRequests('PENDING'),
    refetchInterval: 30_000,
  });

  const canReadTickets = canAdmin(admin, 'support-ticket.read');
  const { data: openTickets = [] } = useQuery({
    queryKey: ['admin-tickets', 'open-badge'],
    queryFn: () => listAdminTickets({ status: 'OPEN' }),
    enabled: Boolean(admin && canReadTickets),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      {NAV_GROUPS.map((group, gIdx) => {
        const visibleItems = group.items.filter((item) => canAdmin(admin, item.permission));
        if (visibleItems.length === 0) return null;

        return (
          <div key={gIdx} className="space-y-1">
            {group.groupLabel && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {group.groupLabel}
              </p>
            )}
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                const pendingCount = item.badgeKey === 'changeRequests' ? pendingRequests.length : 0;
                const openTicketsCount = item.badgeKey === 'supportTickets' ? openTickets.length : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150',
                      isActive
                        ? 'bg-red-500/10 text-white ring-1 ring-red-500/30 font-bold'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <item.icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            isActive ? 'text-red-400' : 'text-slate-400 group-hover:text-slate-200',
                          )}
                        />
                        {item.badgeKey === 'supportTickets' && openTicketsCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500 ring-1 ring-slate-950" />
                          </span>
                        )}
                      </div>
                      <span>{item.label}</span>
                    </div>

                    {pendingCount > 0 && (
                      <span className="flex h-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-500/30">
                        {pendingCount}
                      </span>
                    )}

                    {item.badgeKey === 'supportTickets' && openTicketsCount > 0 && (
                      <span
                        className="flex items-center gap-1.5"
                        title={`${openTicketsCount} yeni/açık destek talebi`}
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" />
                        </span>
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500/20 px-1.5 text-[10px] font-bold text-sky-300 ring-1 ring-sky-500/30">
                          {openTicketsCount}
                        </span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Sessions & MFA shortcut */}
      <div className="pt-2">
        <Link
          href="/admin/sessions"
          className={cn(
            'flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
            pathname.startsWith('/admin/sessions')
              ? 'bg-slate-800 text-white ring-1 ring-slate-700'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
          )}
        >
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <span>Oturumlar & MFA</span>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, fetchMe, logout } = useAdminAuthStore();

  useEffect(() => {
    if (!admin) {
      fetchMe().catch(() => router.push('/admin/login'));
    }
  }, [admin, fetchMe, router]);

  useEffect(() => {
    const requiredPermission = permissionForPath(pathname);
    if (admin && requiredPermission && !canAdmin(admin, requiredPermission)) {
      router.replace('/admin');
    }
  }, [admin, pathname, router]);

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <p className="text-xs font-medium text-slate-400">Yönetim Oturumu Doğrulanıyor…</p>
        </div>
      </div>
    );
  }

  const requiredPermission = permissionForPath(pathname);
  if (requiredPermission && !canAdmin(admin, requiredPermission)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Yetkili sayfaya yönlendiriliyorsunuz…
      </div>
    );
  }

  // Get current page title for breadcrumb
  const currentNav = ALL_NAV_ITEMS.find((n) =>
    n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href),
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex selection:bg-red-500/30 selection:text-white">
      {/* Desktop Sidebar */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950/95 lg:sticky lg:top-0 lg:flex backdrop-blur-xl">
        {/* Logo & Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800/80 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 text-red-400 ring-1 ring-red-500/30 shadow-inner">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white tracking-tight">Axon Admin</span>
              <span className="rounded bg-red-500/20 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-red-400">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Merkezi Platform Yönetimi</p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 scrollbar-thin scrollbar-thumb-slate-800">
          <AdminNavLinks pathname={pathname} />
        </nav>

        {/* User Card & Logout Footer */}
        <div className="border-t border-slate-800/80 p-3.5 bg-slate-950/60">
          <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-slate-800/80 bg-slate-900/80 p-2.5 shadow-inner">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-xs font-bold text-red-300 ring-1 ring-red-500/20">
              {admin.name ? admin.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{admin.name}</p>
              <p className="truncate text-[10px] text-slate-400">{admin.email}</p>
            </div>
          </div>

          <div className="flex gap-1.5">
            <Link
              href="/"
              target="_blank"
              title="Ana Uygulamayı Aç"
              className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <button
              type="button"
              onClick={logout}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs font-medium text-slate-400 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Çıkış Yap</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/95 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-500/20">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Axon Admin</p>
                <p className="text-[10px] text-slate-400">{admin.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Çıkış yap"
              className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-red-500/30 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <AdminNavLinks pathname={pathname} />
          </nav>
        </header>

        {/* Desktop Topbar Header for Breadcrumbs and System Indicator */}
        <header className="hidden lg:flex h-14 items-center justify-between border-b border-slate-800/80 bg-slate-950/40 px-8 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/admin" className="text-slate-400 hover:text-slate-200 transition-colors">
              Axon Admin
            </Link>
            <ChevronRight className="h-3 w-3 text-slate-600" />
            <span className="font-semibold text-slate-200">{currentNav?.label ?? 'Panel'}</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Sistem Aktif & Sağlıklı</span>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 flex-1">
          <AdminSecurityNotice />
          {children}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
