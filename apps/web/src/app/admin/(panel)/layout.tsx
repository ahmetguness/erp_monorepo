'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Shield, LayoutDashboard, Building2, Sliders, BarChart3,
  FileText, LogOut, ChevronRight,
} from 'lucide-react';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/tenants', icon: Building2, label: 'Tenantlar' },
  { href: '/admin/features', icon: Sliders, label: 'Özellikler' },
  { href: '/admin/audit', icon: FileText, label: 'Denetim' },
];

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, fetchMe, logout } = useAdminAuthStore();

  useEffect(() => {
    const hasCookie = document.cookie.includes('admin-token=');
    if (!hasCookie) { router.push('/admin/login'); return; }
    if (!admin) fetchMe();
  }, [admin, fetchMe, router]);

  if (!admin) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-slate-800">
          <Shield className="w-5 h-5 text-red-400 mr-2" />
          <span className="text-sm font-bold text-white">Admin <span className="text-red-400">Panel</span></span>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map((item) => {
            const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-red-500/10 text-red-400 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
                )}>
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold">
              {admin.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{admin.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{admin.email}</p>
            </div>
          </div>
          <button onClick={logout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-colors">
            <LogOut className="w-3.5 h-3.5" />Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
