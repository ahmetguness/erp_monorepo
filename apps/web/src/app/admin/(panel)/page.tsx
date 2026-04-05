'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Building2, Users, Package, Receipt, CreditCard, TrendingUp,
  Shield, ChevronRight, Activity, Zap,
} from 'lucide-react';
import { getPlatformMetrics, getTenants } from '@/services/admin.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, BadgeVariant> = { TRIAL: 'warning', ACTIVE: 'success', SUSPENDED: 'danger', CANCELLED: 'neutral' };
const PLAN_COLOR: Record<string, string> = { STARTER: 'text-sky-400', PROFESSIONAL: 'text-violet-400', ENTERPRISE: 'text-amber-400' };

export default function AdminDashboardPage() {
  const { admin } = useAdminAuthStore();
  const { data: metrics, isLoading } = useQuery({ queryKey: ['admin', 'metrics'], queryFn: getPlatformMetrics });
  const { data: recentTenants } = useQuery({ queryKey: ['admin', 'recent-tenants'], queryFn: () => getTenants({ page: 1, limit: 5 }) });

  if (isLoading || !metrics) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const totalTenantData = metrics.tenants.total;
  const activePct = totalTenantData > 0 ? Math.round((metrics.tenants.active / totalTenantData) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Welcome banner ──────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-red-600/10 via-slate-900 to-slate-800/50 border border-slate-800 rounded-2xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(239,68,68,0.06)_0%,transparent_60%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <Shield className="w-5 h-5 text-red-400" />
              </div>
              <h1 className="text-xl font-semibold text-white">Hoş geldin, {admin?.name?.split(' ')[0]} 👋</h1>
            </div>
            <p className="text-sm text-slate-500 ml-[52px]">Axon ERP Platform Yönetim Paneli</p>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Aktif Oran</p>
              <p className="text-2xl font-bold text-emerald-400">%{activePct}</p>
            </div>
            <div className="w-14 h-14 relative">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-800" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-emerald-400 transition-all duration-700"
                  strokeDasharray={`${(activePct / 100) * 150.8} 150.8`}
                  strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tenant overview ─────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Toplam Tenant', value: metrics.tenants.total, icon: <Building2 className="w-4.5 h-4.5 text-sky-400" />, color: 'bg-sky-500/10', border: 'border-sky-500/10' },
          { label: 'Aktif', value: metrics.tenants.active, icon: <TrendingUp className="w-4.5 h-4.5 text-emerald-400" />, color: 'bg-emerald-500/10', border: 'border-emerald-500/10' },
          { label: 'Deneme', value: metrics.tenants.trial, icon: <Zap className="w-4.5 h-4.5 text-amber-400" />, color: 'bg-amber-500/10', border: 'border-amber-500/10' },
          { label: 'Askıda', value: metrics.tenants.suspended, icon: <Activity className="w-4.5 h-4.5 text-red-400" />, color: 'bg-red-500/10', border: 'border-red-500/10' },
        ].map((s) => (
          <div key={s.label} className={cn('bg-slate-900 border rounded-xl p-4', s.border)}>
            <div className="flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', s.color)}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Middle row: plans + totals ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Plan distribution */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Plan Dağılımı</h2>
          <div className="space-y-3">
            {[
              { plan: 'Starter', count: metrics.plans.starter, color: 'bg-sky-500', textColor: 'text-sky-400' },
              { plan: 'Professional', count: metrics.plans.professional, color: 'bg-violet-500', textColor: 'text-violet-400' },
              { plan: 'Enterprise', count: metrics.plans.enterprise, color: 'bg-amber-500', textColor: 'text-amber-400' },
            ].map((p) => {
              const pct = totalTenantData > 0 ? (p.count / totalTenantData) * 100 : 0;
              return (
                <div key={p.plan}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn('text-sm font-medium', p.textColor)}>{p.plan}</span>
                    <span className="text-sm font-bold text-white">{p.count}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-500', p.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platform totals */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Platform Toplamları</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Kullanıcılar', value: metrics.totals.users, icon: <Users className="w-4 h-4 text-sky-400" />, color: 'bg-sky-500/10' },
              { label: 'Ürünler', value: metrics.totals.products, icon: <Package className="w-4 h-4 text-emerald-400" />, color: 'bg-emerald-500/10' },
              { label: 'Faturalar', value: metrics.totals.invoices, icon: <Receipt className="w-4 h-4 text-violet-400" />, color: 'bg-violet-500/10' },
              { label: 'Ödemeler', value: metrics.totals.payments, icon: <CreditCard className="w-4 h-4 text-amber-400" />, color: 'bg-amber-500/10' },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-3 bg-slate-800/30 rounded-lg p-3">
                <div className={cn('p-2 rounded-lg', t.color)}>{t.icon}</div>
                <div>
                  <p className="text-lg font-bold text-white">{t.value}</p>
                  <p className="text-[10px] text-slate-500">{t.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent tenants ──────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/60">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />Son Eklenen Tenantlar
          </h2>
          <Link href="/admin/tenants" className="text-xs text-red-400 hover:text-red-300 flex items-center gap-0.5">
            Tümü <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {!recentTenants || recentTenants.data.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">Henüz tenant yok</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {recentTenants.data.map((t) => (
              <Link key={t.id} href={`/admin/tenants/${t.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/20 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                  {t.companyName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{t.companyName}</p>
                  <p className="text-[10px] text-slate-500">{t.slug}</p>
                </div>
                <span className={cn('text-xs font-medium', PLAN_COLOR[t.plan])}>{t.plan}</span>
                <Badge variant={STATUS_VARIANT[t.status] ?? 'neutral'}>{t.status}</Badge>
                <span className="text-xs text-slate-600">{new Date(t.createdAt).toLocaleDateString('tr-TR')}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
