'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity, ArrowUpRight, Building2, CreditCard, Package,
  Plus, Receipt, Server, Shield, Timer, TrendingUp, Users, Zap,
} from 'lucide-react';
import { getOperationalObservability, getPlatformMetrics, getTenants } from '@/services/admin.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  TRIAL: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  TRIAL: 'Deneme',
  ACTIVE: 'Aktif',
  SUSPENDED: 'Askıda',
  CANCELLED: 'İptal',
};

const PLAN_LABEL: Record<string, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

const PLAN_COLOR: Record<string, string> = {
  STARTER: 'text-sky-300',
  PROFESSIONAL: 'text-violet-300',
  ENTERPRISE: 'text-amber-300',
};

const numberFormatter = new Intl.NumberFormat('tr-TR');

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} sa ${minutes} dk`;
  return `${minutes} dk`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900 xl:col-span-2" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900 xl:col-span-3" />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { admin } = useAdminAuthStore();
  const { data: metrics, isLoading, isError } = useQuery({ queryKey: ['admin', 'metrics'], queryFn: getPlatformMetrics });
  const { data: recentTenants } = useQuery({ queryKey: ['admin', 'recent-tenants'], queryFn: () => getTenants({ page: 1, limit: 5 }) });
  const { data: observability } = useQuery({ queryKey: ['admin', 'observability'], queryFn: getOperationalObservability, refetchInterval: 30_000 });

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !metrics) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-5">
        <p className="text-sm font-semibold text-red-200">Dashboard verileri alınamadı.</p>
        <p className="mt-1 text-sm text-red-200/70">Lütfen bağlantıyı veya admin oturumunu kontrol edip sayfayı yenileyin.</p>
      </div>
    );
  }

  const totalTenants = metrics.tenants.total;
  const activePct = totalTenants > 0 ? Math.round((metrics.tenants.active / totalTenants) * 100) : 0;
  const trialPct = totalTenants > 0 ? Math.round((metrics.tenants.trial / totalTenants) * 100) : 0;
  const suspendedPct = totalTenants > 0 ? Math.round((metrics.tenants.suspended / totalTenants) * 100) : 0;

  const tenantStats = [
    { label: 'Toplam Tenant', value: metrics.tenants.total, helper: 'Platformdaki şirket hesabı', icon: Building2, tone: 'text-sky-300 bg-sky-500/10 ring-sky-500/20' },
    { label: 'Aktif', value: metrics.tenants.active, helper: `%${activePct} aktif kullanım`, icon: TrendingUp, tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20' },
    { label: 'Deneme', value: metrics.tenants.trial, helper: 'Satış takibi gerekenler', icon: Zap, tone: 'text-amber-300 bg-amber-500/10 ring-amber-500/20' },
    { label: 'Askıda', value: metrics.tenants.suspended, helper: 'Operasyon kontrolü', icon: Activity, tone: 'text-red-300 bg-red-500/10 ring-red-500/20' },
  ];

  const platformTotals = [
    { label: 'Kullanıcılar', value: metrics.totals.users, icon: Users, tone: 'text-sky-300 bg-sky-500/10' },
    { label: 'Ürünler', value: metrics.totals.products, icon: Package, tone: 'text-emerald-300 bg-emerald-500/10' },
    { label: 'Faturalar', value: metrics.totals.invoices, icon: Receipt, tone: 'text-violet-300 bg-violet-500/10' },
    { label: 'Ödemeler', value: metrics.totals.payments, icon: CreditCard, tone: 'text-amber-300 bg-amber-500/10' },
  ];

  const planRows = [
    { plan: 'Starter', count: metrics.plans.starter, color: 'bg-sky-400' },
    { plan: 'Professional', count: metrics.plans.professional, color: 'bg-violet-400' },
    { plan: 'Enterprise', count: metrics.plans.enterprise, color: 'bg-amber-400' },
  ];

  const slowEndpoint = observability?.http.recentSlowEndpoints[0];
  const latestDomainEventFailure = observability?.domainEvents.recentFailures[0];
  const latestProblemJob = observability?.workerJobs.recentProblemJobs[0];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-500/20">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Platform yönetimi</p>
              <h1 className="mt-1 text-xl font-semibold text-white">Hoş geldin, {admin?.name?.split(' ')[0]}</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Tenant durumu, paket dağılımı ve son hareketler tek ekranda izlenir.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/tenants"
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-400"
            >
              <Plus className="h-4 w-4" />
              Yeni Tenant
            </Link>
            <Link
              href="/admin/audit"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
            >
              Denetim Kayıtları
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {observability && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Operasyonel İzleme</h2>
              <p className="mt-1 text-xs text-slate-500">
                Request, domain event ve worker sağlığı 30 saniyede bir yenilenir.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
              <Server className="h-3.5 w-3.5" />
              {observability.runtime.appRole} / {formatDuration(observability.runtime.uptimeSeconds)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">HTTP istek</p>
                <Activity className="h-4 w-4 text-sky-300" />
              </div>
              <p className="mt-2 text-xl font-semibold text-white">{formatNumber(observability.http.totalRequests)}</p>
              <p className="mt-1 text-xs text-slate-500">{formatNumber(observability.http.totalErrors)} server hatası</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">Yavaş endpoint</p>
                <Timer className="h-4 w-4 text-amber-300" />
              </div>
              <p className="mt-2 truncate text-sm font-semibold text-white">{slowEndpoint ? `${slowEndpoint.method} ${slowEndpoint.path}` : 'Yok'}</p>
              <p className="mt-1 text-xs text-slate-500">
                {slowEndpoint ? `${formatNumber(slowEndpoint.durationMs)}ms / eşik ${observability.http.slowThresholdMs}ms` : 'Eşik aşımı görülmedi'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">Event hata</p>
                <Zap className="h-4 w-4 text-red-300" />
              </div>
              <p className="mt-2 text-xl font-semibold text-white">
                {formatNumber(observability.domainEvents.failedCount + observability.domainEvents.deadLetterCount)}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{latestDomainEventFailure?.name ?? 'Aktif hata yok'}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">Worker job</p>
                <Server className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="mt-2 text-xl font-semibold text-white">
                {formatNumber(observability.workerJobs.byStatus.reduce((sum, row) => sum + row.count, 0))}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{latestProblemJob ? `${latestProblemJob.status} ${latestProblemJob.jobType}` : 'Sorunlu job yok'}</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tenantStats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(stat.value)}</p>
                <p className="mt-1 text-xs text-slate-500">{stat.helper}</p>
              </div>
              <div className={cn('rounded-lg p-2 ring-1', stat.tone)}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Tenant Sağlığı</h2>
              <p className="mt-1 text-xs text-slate-500">Aktif, deneme ve askıda oranları</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">%{activePct} aktif</span>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Aktif', pct: activePct, value: metrics.tenants.active, color: 'bg-emerald-400' },
              { label: 'Deneme', pct: trialPct, value: metrics.tenants.trial, color: 'bg-amber-400' },
              { label: 'Askıda', pct: suspendedPct, value: metrics.tenants.suspended, color: 'bg-red-400' },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">{row.label}</span>
                  <span className="text-slate-500">{formatNumber(row.value)} tenant</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className={cn('h-full rounded-full', row.color)} style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 xl:col-span-3">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Platform Toplamları</h2>
              <p className="mt-1 text-xs text-slate-500">Tenantlar genelindeki temel kayıt sayıları</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {platformTotals.map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className={cn('rounded-lg p-2', item.tone)}>
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{formatNumber(item.value)}</p>
                  <p className="text-xs text-slate-500">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold text-white">Plan Dağılımı</h2>
          <div className="mt-5 space-y-4">
            {planRows.map((plan) => {
              const pct = totalTenants > 0 ? Math.round((plan.count / totalTenants) * 100) : 0;
              return (
                <div key={plan.plan}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">{plan.plan}</span>
                    <span className="text-slate-500">{formatNumber(plan.count)} tenant</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={cn('h-full rounded-full', plan.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 xl:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Son Eklenen Tenantlar</h2>
              <p className="mt-1 text-xs text-slate-500">En yeni şirket hesapları</p>
            </div>
            <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-xs font-medium text-red-300 hover:text-red-200">
              Tümünü Gör
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!recentTenants || recentTenants.data.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-300">Henüz tenant yok</p>
              <p className="mt-1 text-xs text-slate-500">İlk tenantı oluşturmak için tenantlar ekranını kullanın.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentTenants.data.map((tenant) => (
                <Link
                  key={tenant.id}
                  href={`/admin/tenants/${tenant.id}`}
                  className="grid gap-3 px-5 py-3 transition-colors hover:bg-slate-800/40 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-300">
                      {tenant.companyName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{tenant.companyName}</p>
                      <p className="truncate text-xs text-slate-500">{tenant.email}</p>
                    </div>
                  </div>
                  <span className={cn('text-xs font-semibold', PLAN_COLOR[tenant.plan])}>
                    {PLAN_LABEL[tenant.plan] ?? tenant.plan}
                  </span>
                  <Badge variant={STATUS_VARIANT[tenant.status] ?? 'neutral'}>
                    {STATUS_LABEL[tenant.status] ?? tenant.status}
                  </Badge>
                  <span className="text-xs text-slate-500">{new Date(tenant.createdAt).toLocaleDateString('tr-TR')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
