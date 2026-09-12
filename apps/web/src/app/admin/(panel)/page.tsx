'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import {
  getAdminChangeRequests,
  getOperationalObservability,
  getPlatformMetrics,
  getSecurityChecklist,
  getTenants,
  type TenantListItem,
} from '@/services/admin.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui.store';
import type { AdminDashboardRangeDays } from '@repo/types';
import { DecisionDashboardSection } from '@/components/features/admin/dashboard/DecisionDashboardSection';

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

const PLAN_BADGE_STYLE: Record<string, { badge: string; text: string; bg: string }> = {
  STARTER: {
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    text: 'text-sky-400',
    bg: 'bg-sky-500',
  },
  PROFESSIONAL: {
    badge: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
    text: 'text-violet-400',
    bg: 'bg-violet-500',
  },
  ENTERPRISE: {
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    text: 'text-amber-400',
    bg: 'bg-amber-500',
  },
};

type DashboardTab = 'overview' | 'decision' | 'observability';
type StatusFilter = 'ALL' | 'ACTIVE' | 'TRIAL' | 'SUSPENDED';

const numberFormatter = new Intl.NumberFormat('tr-TR');

function formatNumber(value: number | undefined | null): string {
  return numberFormatter.format(value ?? 0);
}

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return '0 dk';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}g ${hours}s`;
  if (hours > 0) return `${hours}s ${minutes}dk`;
  return `${minutes}dk`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-slate-800/80 bg-slate-900/60" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-xl border border-slate-800/80 bg-slate-900/60" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="h-80 animate-pulse rounded-xl border border-slate-800/80 bg-slate-900/60 xl:col-span-8" />
        <div className="h-80 animate-pulse rounded-xl border border-slate-800/80 bg-slate-900/60 xl:col-span-4" />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { admin } = useAdminAuthStore();
  const queryClient = useQueryClient();
  const canReadOperations = canAdmin(admin, 'operations.read');
  const canReadChangeRequests = canAdmin(admin, 'change-request.read');
  const canReadSecurity = canAdmin(admin, 'security.read');

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(30_000);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [tenantSearchQuery, setTenantSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [copiedTenantId, setCopiedTenantId] = useState<string | null>(null);
  const [decisionRangeDays, setDecisionRangeDays] = useState<AdminDashboardRangeDays>(30);

  const {
    data: metrics,
    isLoading: isMetricsLoading,
    isError: isMetricsError,
    isFetching: isMetricsFetching,
  } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () => {
      const res = await getPlatformMetrics();
      setLastRefreshedAt(new Date());
      return res;
    },
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });

  const { data: recentTenants, isFetching: isTenantsFetching } = useQuery({
    queryKey: ['admin', 'recent-tenants'],
    queryFn: () => getTenants({ page: 1, limit: 12 }),
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });

  const { data: observability } = useQuery({
    queryKey: ['admin', 'observability'],
    queryFn: getOperationalObservability,
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
    enabled: canReadOperations,
  });

  const { data: pendingChangeRequests = [] } = useQuery({
    queryKey: ['admin', 'change-requests', 'pending'],
    queryFn: () => getAdminChangeRequests('PENDING'),
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
    enabled: canReadChangeRequests,
  });

  const { data: securityChecklist } = useQuery({
    queryKey: ['admin', 'security-checklist'],
    queryFn: getSecurityChecklist,
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
    enabled: canReadSecurity,
  });

  const handleManualRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'recent-tenants'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'observability'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'change-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'security-checklist'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'decision-dashboard'] }),
    ]);
    setLastRefreshedAt(new Date());
    toast.success('Karar merkezi verileri güncellendi.');
  };

  const handleCopyTenantId = (id: string, name: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTenantId(id);
    toast.success(`${name} ID kopyalandı`);
    setTimeout(() => {
      setCopiedTenantId(null);
    }, 2000);
  };

  // Filter recent tenants based on search input and status filter
  const filteredRecentTenants = useMemo(() => {
    if (!recentTenants?.data) return [];
    let list = recentTenants.data;

    if (statusFilter !== 'ALL') {
      list = list.filter((t) => t.status === statusFilter);
    }

    if (tenantSearchQuery.trim()) {
      const q = tenantSearchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.companyName.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.plan.toLowerCase().includes(q),
      );
    }

    return list;
  }, [recentTenants, tenantSearchQuery, statusFilter]);

  if (isMetricsLoading) return <DashboardSkeleton />;

  if (isMetricsError || !metrics) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-gradient-to-b from-red-500/10 to-red-950/20 p-6 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-red-500/20 p-2.5 text-red-400 ring-1 ring-red-500/30">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Yönetim merkezi verileri alınamadı</h2>
            <p className="text-xs text-red-300/80">
              Admin yetkiniz veya API servisi kontrol edilemedi. Lütfen bağlantınızı kontrol edin.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow transition-all hover:bg-red-500 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  const isRefreshing = isMetricsFetching || isTenantsFetching;
  const totalTenants = metrics.tenants.total;
  const activePct = totalTenants > 0 ? Math.round((metrics.tenants.active / totalTenants) * 100) : 0;
  const trialPct = totalTenants > 0 ? Math.round((metrics.tenants.trial / totalTenants) * 100) : 0;
  const suspendedPct = totalTenants > 0 ? Math.round((metrics.tenants.suspended / totalTenants) * 100) : 0;

  // Observability highlights
  const domainEventFailureCount =
    (observability?.domainEvents.failedCount ?? 0) + (observability?.domainEvents.deadLetterCount ?? 0);
  const workerProblemCount = observability?.workerJobs.recentProblemJobs?.length ?? 0;
  const activeAlerts = observability?.alerts?.filter((a) => a.active) ?? [];

  // Security status helper
  const securityPass = securityChecklist?.summary === 'pass';
  const securityWarn = securityChecklist?.summary === 'warn';

  const planRows = [
    {
      plan: 'Starter',
      count: metrics.plans.starter,
      color: 'bg-sky-400',
      text: 'text-sky-400',
    },
    {
      plan: 'Professional',
      count: metrics.plans.professional,
      color: 'bg-violet-400',
      text: 'text-violet-400',
    },
    {
      plan: 'Enterprise',
      count: metrics.plans.enterprise,
      color: 'bg-amber-400',
      text: 'text-amber-400',
    },
  ];

  return (
    <div className="space-y-4 pb-8">
      {/* ─────────────────────────────────────────────
          1. COMPACT EXECUTIVE COMMAND HEADER
      ───────────────────────────────────────────── */}
      <header className="rounded-xl border border-slate-800/90 bg-slate-900/80 px-4 py-3 shadow-md backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Title & Live indicators */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
              <Shield className="h-4 w-4" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">Platform Yönetim Merkezi</h1>
                <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                  <UserCheck className="h-2.5 w-2.5 text-red-400" />
                  {admin?.roles?.[0] ?? 'SUPER_ADMIN'}
                </span>
              </div>

              {/* Mini Status Line */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Canlı
                </span>
                <span className="text-slate-600">•</span>
                {observability && (
                  <>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Server className="h-3 w-3 text-slate-500" />
                      Uptime: {formatDuration(observability.runtime.uptimeSeconds)}
                    </span>
                    <span className="text-slate-600">•</span>
                  </>
                )}
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="h-3 w-3" />
                  {lastRefreshedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions & Live Refresh Toolbar */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {/* Auto refresh control */}
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/70 p-0.5 text-xs text-slate-400">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Şimdi Yenile"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3 w-3 text-red-400', isRefreshing && 'animate-spin')} />
                <span className="hidden md:inline">Yenile</span>
              </button>

              <div className="mx-0.5 h-3 w-[1px] bg-slate-800" />

              <select
                value={refreshIntervalMs}
                onChange={(e) => setRefreshIntervalMs(Number(e.target.value))}
                aria-label="Otomatik yenileme aralığı"
                className="cursor-pointer bg-transparent px-1.5 py-1 text-[11px] text-slate-300 outline-none hover:text-white"
              >
                <option value={15000} className="bg-slate-900 text-slate-200">15 sn</option>
                <option value={30000} className="bg-slate-900 text-slate-200">30 sn</option>
                <option value={60000} className="bg-slate-900 text-slate-200">60 sn</option>
                <option value={0} className="bg-slate-900 text-slate-200">Kapalı</option>
              </select>
            </div>

            {pendingChangeRequests.length > 0 && (
              <Link
                href="/admin/change-requests"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-500/20 active:scale-95"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <span>{pendingChangeRequests.length} Onay</span>
              </Link>
            )}

            <Link
              href="/admin/tenants"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition-all hover:bg-red-500 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Yeni Tenant</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────
          2. SLIM ALERT BANNER (Only if issues exist)
      ───────────────────────────────────────────── */}
      {(activeAlerts.length > 0 || domainEventFailureCount > 0) && (
        <aside
          aria-label="Kritik sistem uyarısı"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3.5 py-2 text-xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span className="font-medium text-rose-200">
              {domainEventFailureCount > 0 && `${domainEventFailureCount} başarısız outbox eventi / dead-letter. `}
              {activeAlerts.length > 0 && `${activeAlerts.length} sistem eşiği aşıldı.`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('observability')}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors"
          >
            <span>Teşhis Et</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </aside>
      )}

      {/* ─────────────────────────────────────────────
          3. UNIFIED COMPACT 4-KPI BAR
      ───────────────────────────────────────────── */}
      <section aria-label="Temel platform metrikleri" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {/* Metric 1: Tenants */}
        <div className="group rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 transition-all hover:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Müşteri Hesapları</span>
            <span className="rounded-md bg-sky-500/10 p-1.5 text-sky-400 ring-1 ring-sky-500/20">
              <Building2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">{formatNumber(metrics.tenants.total)}</span>
            <Link
              href="/admin/tenants"
              className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline"
            >
              Yönet &rarr;
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {metrics.tenants.active} Aktif
            </span>
            <span className="text-slate-600">•</span>
            <span className="inline-flex items-center gap-1 text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {metrics.tenants.trial} Deneme
            </span>
            {metrics.tenants.suspended > 0 && (
              <>
                <span className="text-slate-600">•</span>
                <span className="inline-flex items-center gap-1 text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  {metrics.tenants.suspended} Askıda
                </span>
              </>
            )}
          </div>
        </div>

        {/* Metric 2: Observability Health */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('observability')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('observability');
            }
          }}
          className="group cursor-pointer rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 transition-all hover:border-slate-700 text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Sistem Nabzı</span>
            <span className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-400 ring-1 ring-emerald-500/20">
              <Activity className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {observability ? formatNumber(observability.http.totalRequests) : '–'}
            </span>
            <span className="text-[11px] text-slate-400">istek</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">
              P95: <strong className="text-slate-200">{observability?.http.p95Ms ?? 0}ms</strong>
            </span>
            <span
              className={cn(
                'rounded px-1.5 py-0.2 font-semibold',
                (observability?.http.errorRatePct ?? 0) > 1
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-emerald-500/20 text-emerald-300',
              )}
            >
              %{observability?.http.errorRatePct.toFixed(2) ?? '0.00'} hata
            </span>
          </div>
        </div>

        {/* Metric 3: Platform Volume */}
        <div className="group rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 transition-all hover:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Platform Kullanımı</span>
            <span className="rounded-md bg-indigo-500/10 p-1.5 text-indigo-400 ring-1 ring-indigo-500/20">
              <Layers className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">{formatNumber(metrics.totals.users)}</span>
            <span className="text-[11px] text-slate-400">kullanıcı</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Fatura: <strong className="text-slate-200">{formatNumber(metrics.totals.invoices)}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span>
              Ürün: <strong className="text-slate-200">{formatNumber(metrics.totals.products)}</strong>
            </span>
          </div>
        </div>

        {/* Metric 4: Security & Pending Approvals */}
        <div className="group rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 transition-all hover:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Güvenlik & Onay</span>
            <span className="rounded-md bg-purple-500/10 p-1.5 text-purple-400 ring-1 ring-purple-500/20">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <Link
              href="/admin/security"
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors',
                securityPass
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : securityWarn
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border border-red-500/30 bg-red-500/10 text-red-300',
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              {securityPass ? 'Güvenlik Tam' : securityWarn ? 'Uyarı Var' : 'Kritik Risk'}
            </Link>

            <Link
              href="/admin/change-requests"
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Talepler &rarr;
            </Link>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Bekleyen Talep:</span>
            <span
              className={cn(
                'font-semibold',
                pendingChangeRequests.length > 0 ? 'text-amber-400' : 'text-slate-300',
              )}
            >
              {pendingChangeRequests.length > 0 ? `${pendingChangeRequests.length} talep onayda` : 'Tümü Onaylı'}
            </span>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────
          4. WORKSPACE SEGMENT SWITCHER TABS
      ───────────────────────────────────────────── */}
      <nav aria-label="Panel bölümleri" className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
              activeTab === 'overview'
                ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <Building2 className="h-3.5 w-3.5 text-red-400" />
            <span>Genel Bakış & Tenantlar</span>
            <span className="ml-1 rounded-full bg-slate-700/60 px-1.5 py-0.2 text-[10px] text-slate-300">
              {recentTenants?.data?.length ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('decision')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
              activeTab === 'decision'
                ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
            <span>Karar & Büyüme</span>
            <span className="ml-1 rounded-full bg-sky-500/20 px-1.5 py-0.2 text-[10px] text-sky-300">
              {decisionRangeDays}g
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('observability')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
              activeTab === 'observability'
                ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span>Sistem Sağlığı</span>
            {domainEventFailureCount > 0 && (
              <span className="ml-1 rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-bold text-rose-400">
                {domainEventFailureCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick Links on the right */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
          <Link href="/admin/tenants" className="hover:text-white transition-colors">
            Tüm Şirketler ({totalTenants})
          </Link>
          <span className="text-slate-700">•</span>
          <Link href="/admin/change-requests" className="hover:text-white transition-colors">
            Onay Merkezi
          </Link>
          <span className="text-slate-700">•</span>
          <Link href="/admin/audit" className="hover:text-white transition-colors">
            Denetim
          </Link>
        </div>
      </nav>

      {/* ─────────────────────────────────────────────
          5. TAB CONTENT: OVERVIEW (MAIN OPERATIONAL VIEW)
      ───────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Main Left Column (8 cols): Recent Tenants Table */}
          <div className="space-y-4 xl:col-span-8">
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-md overflow-hidden">
              {/* Header & Integrated Filters */}
              <div className="border-b border-slate-800/80 p-3.5">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">Son Eklenen Tenantlar</h2>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                      {filteredRecentTenants.length} kayıt
                    </span>
                  </div>

                  {/* Status Pills Filter */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {(['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setStatusFilter(filter)}
                        className={cn(
                          'rounded-md px-2 py-1 font-medium transition-colors',
                          statusFilter === filter
                            ? 'bg-slate-800 text-white font-semibold ring-1 ring-slate-700'
                            : 'text-slate-400 hover:text-slate-200',
                        )}
                      >
                        {filter === 'ALL'
                          ? 'Tümü'
                          : filter === 'ACTIVE'
                            ? 'Aktif'
                            : filter === 'TRIAL'
                              ? 'Deneme'
                              : 'Askıda'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Search Bar */}
                <div className="relative mt-2.5">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={tenantSearchQuery}
                    onChange={(e) => setTenantSearchQuery(e.target.value)}
                    placeholder="Şirket adı, email, slug veya ID ile filtrele..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/70 py-1.5 pl-8 pr-4 text-xs text-slate-200 placeholder-slate-500 outline-none ring-red-500/30 transition-all focus:border-red-500/50 focus:ring-1"
                  />
                  {tenantSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTenantSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 hover:text-slate-300"
                    >
                      Temizle
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Tenant List */}
              {filteredRecentTenants.length === 0 ? (
                <div className="p-8 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-2 text-xs font-medium text-slate-300">
                    {tenantSearchQuery ? 'Aramaya uygun tenant bulunamadı' : 'Kayıt bulunamadı'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {filteredRecentTenants.map((tenant: TenantListItem) => {
                    const planStyle = PLAN_BADGE_STYLE[tenant.plan] ?? PLAN_BADGE_STYLE.STARTER;
                    return (
                      <div
                        key={tenant.id}
                        className="group flex flex-col gap-2 p-3 transition-colors hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between"
                      >
                        {/* Company & Details */}
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 text-xs font-bold text-slate-300 ring-1 ring-slate-700">
                            {tenant.companyName ? tenant.companyName.charAt(0).toUpperCase() : 'T'}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/admin/tenants/${tenant.id}`}
                                className="truncate text-xs font-semibold text-white hover:text-red-400 transition-colors"
                              >
                                {tenant.companyName}
                              </Link>
                              <span className="truncate text-[11px] text-slate-500">({tenant.slug})</span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <span className="truncate">{tenant.email}</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-500">
                                {new Date(tenant.createdAt).toLocaleDateString('tr-TR')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Badges & Actions */}
                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold border', planStyle.badge)}>
                            {PLAN_LABEL[tenant.plan] ?? tenant.plan}
                          </span>

                          <Badge variant={STATUS_VARIANT[tenant.status] ?? 'neutral'} className="text-[10px] px-2 py-0.5">
                            {STATUS_LABEL[tenant.status] ?? tenant.status}
                          </Badge>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyTenantId(tenant.id, tenant.companyName)}
                              title="Tenant ID Kopyala"
                              className="rounded-md border border-slate-800 bg-slate-950/80 p-1 text-slate-400 hover:text-white"
                            >
                              {copiedTenantId === tenant.id ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>

                            <Link
                              href={`/admin/tenants/${tenant.id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-700 hover:text-white"
                            >
                              <span>Detay</span>
                              <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pending Approvals Widget (if any) */}
            {pendingChangeRequests.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-md">
                <div className="flex items-center justify-between border-b border-amber-500/20 pb-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                    <h2 className="text-xs font-bold text-amber-200">
                      Onay Bekleyen Talepler ({pendingChangeRequests.length})
                    </h2>
                  </div>
                  <Link
                    href="/admin/change-requests"
                    className="text-[11px] font-semibold text-amber-400 hover:underline"
                  >
                    Tümünü Gör &rarr;
                  </Link>
                </div>

                <div className="space-y-2">
                  {pendingChangeRequests.slice(0, 2).map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-slate-900/60 p-2.5 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                            {req.type}
                          </span>
                          <span className="font-semibold text-white">{req.targetLabel}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {req.requestedBy.name} • {req.reason}
                        </p>
                      </div>

                      <Link
                        href="/admin/change-requests"
                        className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-amber-400"
                      >
                        İncele
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (4 cols): Plan Breakdown & System Overview */}
          <div className="space-y-4 xl:col-span-4">
            {/* Plan Distribution Card */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
                <h2 className="text-xs font-bold text-white">Paket & Plan Dağılımı</h2>
                <Link
                  href="/admin/features"
                  className="text-[11px] text-red-400 hover:text-red-300"
                >
                  Plan Ayarları &rarr;
                </Link>
              </div>

              <div className="space-y-2.5">
                {planRows.map((plan) => {
                  const pct = totalTenants > 0 ? Math.round((plan.count / totalTenants) * 100) : 0;
                  return (
                    <div key={plan.plan} className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('h-2 w-2 rounded-full', plan.color)} />
                          <span className="font-semibold text-slate-200">{plan.plan}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white">{formatNumber(plan.count)}</span>
                          <span className="text-[10px] text-slate-400">({pct}%)</span>
                        </div>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', plan.color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Platform Totals Mini Grid */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow-md">
              <h2 className="text-xs font-bold text-white border-b border-slate-800/80 pb-2 mb-3">
                Platform Hacmi Özeti
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="flex items-center gap-1.5 text-cyan-400 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-slate-400 text-[11px]">Kullanıcı</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-white">{formatNumber(metrics.totals.users)}</p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                    <Package className="h-3.5 w-3.5" />
                    <span className="text-slate-400 text-[11px]">Ürün</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-white">{formatNumber(metrics.totals.products)}</p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="flex items-center gap-1.5 text-purple-400 text-xs">
                    <CreditCard className="h-3.5 w-3.5" />
                    <span className="text-slate-400 text-[11px]">Fatura</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-white">{formatNumber(metrics.totals.invoices)}</p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="text-slate-400 text-[11px]">Ödeme</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-white">{formatNumber(metrics.totals.payments)}</p>
                </div>
              </div>
            </div>

            {/* Quick Diagnostic Shortcuts */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 shadow-md">
              <h2 className="text-xs font-bold text-white border-b border-slate-800/80 pb-2 mb-2.5">
                Hızlı Operasyon Kısayolları
              </h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Link
                  href="/admin/observability"
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-slate-300 hover:border-slate-700 hover:text-white"
                >
                  <span className="text-[11px]">Telemetri</span>
                  <ArrowUpRight className="h-3 w-3 text-slate-500" />
                </Link>

                <Link
                  href="/admin/audit"
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-slate-300 hover:border-slate-700 hover:text-white"
                >
                  <span className="text-[11px]">Denetim Logu</span>
                  <ArrowUpRight className="h-3 w-3 text-slate-500" />
                </Link>

                <Link
                  href="/admin/security"
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-slate-300 hover:border-slate-700 hover:text-white"
                >
                  <span className="text-[11px]">Güvenlik</span>
                  <ArrowUpRight className="h-3 w-3 text-slate-500" />
                </Link>

                <Link
                  href="/admin/disaster-recovery"
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-slate-300 hover:border-slate-700 hover:text-white"
                >
                  <span className="text-[11px]">Yedekleme</span>
                  <ArrowUpRight className="h-3 w-3 text-slate-500" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────
          6. TAB CONTENT: DECISION & GROWTH (KARAR MERKEZİ)
      ───────────────────────────────────────────── */}
      {activeTab === 'decision' && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-md">
          <DecisionDashboardSection rangeDays={decisionRangeDays} onRangeChange={setDecisionRangeDays} />
        </div>
      )}

      {/* ─────────────────────────────────────────────
          7. TAB CONTENT: OBSERVABILITY & TELEMETRY
      ───────────────────────────────────────────── */}
      {activeTab === 'observability' && observability && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-md">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Canlı Operasyonel Nabız</h2>
              </div>
              <Link
                href="/admin/observability"
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300"
              >
                <span>Ayrıntılı Telemetri Sayfası</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* HTTP Requests */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <span className="text-xs text-slate-400">HTTP İstek Hacmi</span>
                <p className="mt-1 text-xl font-bold text-white">{formatNumber(observability.http.totalRequests)}</p>
                <div className="mt-1 text-[11px] text-slate-400">
                  Hata: <span className={cn('font-semibold', observability.http.errorRatePct > 1 ? 'text-rose-400' : 'text-emerald-400')}>
                    %{observability.http.errorRatePct.toFixed(2)} ({formatNumber(observability.http.totalErrors)})
                  </span>
                </div>
              </div>

              {/* Latency */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <span className="text-xs text-slate-400">Gecikme (P95 / P99)</span>
                <p className="mt-1 text-xl font-bold text-white">
                  {formatNumber(observability.http.p95Ms)}ms
                  <span className="text-xs font-normal text-slate-400"> / {formatNumber(observability.http.p99Ms)}ms</span>
                </p>
                <div className="mt-1 text-[11px] text-slate-500">
                  Eşik: {observability.http.slowThresholdMs}ms
                </div>
              </div>

              {/* Domain Events */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <span className="text-xs text-slate-400">Outbox / Event Kuyruğu</span>
                <p className="mt-1 text-xl font-bold text-white">
                  {formatNumber(observability.domainEvents.pendingCount + observability.domainEvents.processingCount)}
                </p>
                <div className="mt-1 text-[11px]">
                  Dead Letter:{' '}
                  <span className={cn('font-semibold', domainEventFailureCount > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                    {formatNumber(domainEventFailureCount)}
                  </span>
                </div>
              </div>

              {/* Worker Jobs */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <span className="text-xs text-slate-400">Worker Sync Kuyruğu</span>
                <p className="mt-1 text-xl font-bold text-white">
                  {formatNumber(observability.workerJobs.byStatus.reduce((sum, row) => sum + row.count, 0))}
                </p>
                <div className="mt-1 text-[11px]">
                  Sorunlu:{' '}
                  <span className={cn('font-semibold', workerProblemCount > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                    {workerProblemCount > 0 ? `${workerProblemCount} job hata aldı` : 'Sorunsuz'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
