'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Shield, LayoutDashboard, Building2, Sliders,
  FileText, LogOut,
} from 'lucide-react';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/tenants', icon: Building2, label: 'Tenantlar' },
  { href: '/admin/features', icon: Sliders, label: 'Özellikler' },
  { href: '/admin/audit', icon: FileText, label: 'Denetim' },
];

function AdminNavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {NAV.map((item) => {
        const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-red-500/10 text-red-300 ring-1 ring-red-500/20'
                : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, fetchMe, logout } = useAdminAuthStore();

  useEffect(() => {
    const hasCookie = document.cookie.includes('admin-token=');
    if (!hasCookie) {
      router.push('/admin/login');
      return;
    }
    if (!admin) fetchMe();
  }, [admin, fetchMe, router]);

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 lg:sticky lg:top-0 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-500/20">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Axon Admin</p>
            <p className="text-[11px] text-slate-500">Platform yönetimi</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <AdminNavLinks pathname={pathname} />
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-slate-900/70 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-200">
              {admin.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-200">{admin.name}</p>
              <p className="truncate text-[10px] text-slate-500">{admin.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-500/20">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Axon Admin</p>
                <p className="text-[11px] text-slate-500">{admin.name}</p>
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
          <nav className="flex gap-2 overflow-x-auto pb-1">
            <AdminNavLinks pathname={pathname} />
          </nav>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
