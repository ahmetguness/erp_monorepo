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
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui.store';

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

const numberFormatter = new Intl.NumberFormat('tr-TR');

function formatNumber(value: number): string {
  return numberFormatter.format(value ?? 0);
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 dk';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}g ${hours} sa ${minutes} dk`;
  if (hours > 0) return `${hours} sa ${minutes} dk`;
  return `${minutes} dk`;
}


function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-36 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="h-96 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60 xl:col-span-5" />
        <div className="h-96 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60 xl:col-span-7" />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { admin } = useAdminAuthStore();
  const queryClient = useQueryClient();

  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(30_000);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [tenantSearchQuery, setTenantSearchQuery] = useState<string>('');
  const [copiedTenantId, setCopiedTenantId] = useState<string | null>(null);

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
    queryFn: () => getTenants({ page: 1, limit: 10 }),
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });

  const { data: observability } = useQuery({
    queryKey: ['admin', 'observability'],
    queryFn: getOperationalObservability,
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });

  const { data: pendingChangeRequests = [] } = useQuery({
    queryKey: ['admin', 'change-requests', 'pending'],
    queryFn: () => getAdminChangeRequests('PENDING'),
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });

  const { data: securityChecklist } = useQuery({
    queryKey: ['admin', 'security-checklist'],
    queryFn: getSecurityChecklist,
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });

  const handleManualRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'recent-tenants'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'observability'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'change-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'security-checklist'] }),
    ]);
    setLastRefreshedAt(new Date());
    toast.success('Dashboard verileri güncellendi.');
  };

  const handleCopyTenantId = (id: string, name: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTenantId(id);
    toast.success(`${name} ID kopyalandı`);
    setTimeout(() => {
      setCopiedTenantId(null);
    }, 2000);
  };

  // Filter recent tenants based on search input
  const filteredRecentTenants = useMemo(() => {
    if (!recentTenants?.data) return [];
    if (!tenantSearchQuery.trim()) return recentTenants.data;
    const q = tenantSearchQuery.toLowerCase().trim();
    return recentTenants.data.filter(
      (t) =>
        t.companyName.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.plan.toLowerCase().includes(q),
    );
  }, [recentTenants, tenantSearchQuery]);

  if (isMetricsLoading) return <DashboardSkeleton />;

  if (isMetricsError || !metrics) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-gradient-to-b from-red-500/10 to-red-950/20 p-8 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-red-500/20 p-3 text-red-400 ring-1 ring-red-500/30">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Dashboard verileri alınamadı</h2>
            <p className="mt-1 text-sm text-red-300/80">
              Admin yetkiniz veya API servisi kontrol edilemedi. Lütfen bağlantınızı kontrol edin.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-500 active:scale-95"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  const totalTenants = metrics.tenants.total;
  const activePct = totalTenants > 0 ? Math.round((metrics.tenants.active / totalTenants) * 100) : 0;
  const trialPct = totalTenants > 0 ? Math.round((metrics.tenants.trial / totalTenants) * 100) : 0;
  const suspendedPct = totalTenants > 0 ? Math.round((metrics.tenants.suspended / totalTenants) * 100) : 0;

  const tenantStats = [
    {
      label: 'Toplam Tenant',
      value: metrics.tenants.total,
      subtext: `${metrics.tenants.active} aktif platform hesabı`,
      href: '/admin/tenants',
      icon: Building2,
      accent: 'from-sky-500/20 to-sky-500/5',
      border: 'border-sky-500/30 hover:border-sky-500/60',
      iconTone: 'text-sky-400 bg-sky-500/10 ring-sky-500/30',
      badge: 'Platform',
      progress: 100,
      progressBar: 'bg-sky-400',
    },
    {
      label: 'Aktif Şirketler',
      value: metrics.tenants.active,
      subtext: `%${activePct} aktif operasyon oranı`,
      href: '/admin/tenants?status=ACTIVE',
      icon: TrendingUp,
      accent: 'from-emerald-500/20 to-emerald-500/5',
      border: 'border-emerald-500/30 hover:border-emerald-500/60',
      iconTone: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30',
      badge: `%${activePct} Sağlıklı`,
      progress: activePct,
      progressBar: 'bg-emerald-400',
    },
    {
      label: 'Deneme Sürümü',
      value: metrics.tenants.trial,
      subtext: `%${trialPct} dönüşüm takibi gereken`,
      href: '/admin/tenants?status=TRIAL',
      icon: Zap,
      accent: 'from-amber-500/20 to-amber-500/5',
      border: 'border-amber-500/30 hover:border-amber-500/60',
      iconTone: 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
      badge: 'Dönüşüm Potansiyeli',
      progress: trialPct,
      progressBar: 'bg-amber-400',
    },
    {
      label: 'Askıya Alınan / Risk',
      value: metrics.tenants.suspended,
      subtext: suspendedPct > 0 ? `%${suspendedPct} operasyon müdahalesi` : 'Riskli tenant yok',
      href: '/admin/tenants?status=SUSPENDED',
      icon: Activity,
      accent: 'from-rose-500/20 to-rose-500/5',
      border: 'border-rose-500/30 hover:border-rose-500/60',
      iconTone: 'text-rose-400 bg-rose-500/10 ring-rose-500/30',
      badge: suspendedPct > 0 ? 'Müdahale Gerekli' : 'Temiz',
      progress: suspendedPct,
      progressBar: 'bg-rose-400',
    },
  ];

  const platformTotals = [
    {
      label: 'Toplam Kullanıcı',
      value: metrics.totals.users,
      icon: Users,
      tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      desc: 'Şirket personelleri & adminler',
    },
    {
      label: 'Kayıtlı Ürün',
      value: metrics.totals.products,
      icon: Package,
      tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      desc: 'Envanter ve stok kartları',
    },
    {
      label: 'Kesilen Fatura',
      value: metrics.totals.invoices,
      icon: CreditCard,
      tone: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      desc: 'E-Fatura & E-Arşiv toplamı',
    },
    {
      label: 'Tahsilat & Ödeme',
      value: metrics.totals.payments,
      icon: Sparkles,
      tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      desc: 'Platform içi mali hareketler',
    },
  ];

  const planRows = [
    {
      plan: 'Starter',
      count: metrics.plans.starter,
      color: 'bg-sky-400',
      text: 'text-sky-400',
      border: 'border-sky-500/30',
      tag: 'Giriş Seviyesi',
    },
    {
      plan: 'Professional',
      count: metrics.plans.professional,
      color: 'bg-violet-400',
      text: 'text-violet-400',
      border: 'border-violet-500/30',
      tag: 'Büyüyen İşletmeler',
    },
    {
      plan: 'Enterprise',
      count: metrics.plans.enterprise,
      color: 'bg-amber-400',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      tag: 'Kurumsal Ölçek',
    },
  ];

  const isRefreshing = isMetricsFetching || isTenantsFetching;

  // Observability highlights
  const slowEndpoint = observability?.http.recentSlowEndpoints?.[0];
  const domainEventFailureCount =
    (observability?.domainEvents.failedCount ?? 0) + (observability?.domainEvents.deadLetterCount ?? 0);
  const workerProblemCount = observability?.workerJobs.recentProblemJobs?.length ?? 0;
  const activeAlerts = observability?.alerts?.filter((a) => a.active) ?? [];

  // Security status helper
  const securityPass = securityChecklist?.summary === 'pass';
  const securityWarn = securityChecklist?.summary === 'warn';

  return (
    <div className="space-y-6 pb-12">
      {/* ─────────────────────────────────────────────
          1. TOP COMMAND DECK & GREETING
      ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-red-500/5 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 text-red-400 ring-1 ring-red-500/30 shadow-inner">
              <Shield className="h-7 w-7" />
              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950 ring-2 ring-slate-900">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-slate-800/70 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                  <UserCheck className="h-3 w-3 text-red-400" />
                  {admin?.roles?.[0] ?? 'SUPER_ADMIN'}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs font-medium text-slate-400">
                  {new Date().toLocaleDateString('tr-TR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                {securityChecklist && (
                  <Link
                    href="/admin/security"
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                      securityPass
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        : securityWarn
                          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                          : 'border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20',
                    )}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {securityPass ? 'Güvenlik Tam' : securityWarn ? 'Güvenlik Uyarısı' : 'Kritik Güvenlik'}
                  </Link>
                )}
              </div>

              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Platform Yönetim Merkezi
              </h1>

              <p className="mt-1 text-sm text-slate-400">
                Axon ERP Platform Yönetim Merkezi. Çoklu tenant sağlığı, onay talepleri ve gerçek zamanlı sistem izleme.
              </p>
            </div>
          </div>

          {/* Quick Actions & Live Refresh Controls */}
          <div className="flex flex-wrap items-center gap-2.5 sm:self-start lg:self-center">
            {/* Auto refresh select */}
            <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950/70 p-1 text-xs text-slate-400 shadow-inner">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Şimdi Yenile"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5 text-red-400', isRefreshing && 'animate-spin')} />
                <span className="hidden sm:inline">Yenile</span>
              </button>

              <div className="mx-1 h-3.5 w-[1px] bg-slate-800" />

              <select
                value={refreshIntervalMs}
                onChange={(e) => setRefreshIntervalMs(Number(e.target.value))}
                aria-label="Otomatik yenileme aralığı"
                className="cursor-pointer bg-transparent px-2 py-1 text-xs text-slate-300 outline-none transition-colors hover:text-white"
              >
                <option value={15000} className="bg-slate-900 text-slate-200">
                  15 sn
                </option>
                <option value={30000} className="bg-slate-900 text-slate-200">
                  30 sn
                </option>
                <option value={60000} className="bg-slate-900 text-slate-200">
                  60 sn
                </option>
                <option value={0} className="bg-slate-900 text-slate-200">
                  Kapalı
                </option>
              </select>
            </div>

            {pendingChangeRequests.length > 0 && (
              <Link
                href="/admin/change-requests"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 shadow-lg shadow-amber-500/5 transition-all hover:bg-amber-500/20 active:scale-95"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <span>{pendingChangeRequests.length} Onay Bekliyor</span>
              </Link>
            )}

            <Link
              href="/admin/tenants"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-500/20 transition-all hover:from-red-500 hover:to-red-400 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Yeni Tenant</span>
            </Link>
          </div>
        </div>

        {/* Live Subtitle Info */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Son güncelleme: {lastRefreshedAt.toLocaleTimeString('tr-TR')}
            </span>
            {observability && (
              <span className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-slate-400" />
                Çalışma süresi: {formatDuration(observability.runtime.uptimeSeconds)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/observability"
              className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>Canlı Telemetri</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <span className="text-slate-700">•</span>
            <Link
              href="/admin/audit"
              className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>Denetim Günlüğü</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────
          2. ACTIVE ALERTS / CRITICAL BANNER (Conditional)
      ───────────────────────────────────────────── */}
      {(activeAlerts.length > 0 || domainEventFailureCount > 0) && (
        <section className="rounded-2xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 p-4 shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-500/20 p-2 text-rose-400 ring-1 ring-rose-500/30">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-rose-200">Sistemde Dikkat Gerektiren Durumlar Var</h2>
                <p className="mt-0.5 text-xs text-rose-300/80">
                  {domainEventFailureCount > 0 && `${domainEventFailureCount} başarısız domain eventi/dead-letter tespit edildi. `}
                  {activeAlerts.length > 0 && `${activeAlerts.length} sistem eşiği aşıldı.`}
                </p>
              </div>
            </div>
            <Link
              href="/admin/observability"
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"
            >
              <span>Teşhis Et</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────
          3. REAL-TIME OBSERVABILITY HEALTH RADAR
      ───────────────────────────────────────────── */}
      {observability && (
        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Operasyonel Nabız (Observability)</h2>
                <p className="text-[11px] text-slate-400">
                  HTTP İstekleri, Yanıt Süresi (Latency) ve Kuyruk Durumu
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                {observability.runtime.appRole} Canlı
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Requests & Errors */}
            <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">HTTP İstek Hacmi</span>
                <span className="rounded-lg bg-sky-500/10 p-1.5 text-sky-400 ring-1 ring-sky-500/20">
                  <Activity className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-white tracking-tight">
                {formatNumber(observability.http.totalRequests)}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">Hata Oranı:</span>
                <span
                  className={cn(
                    'font-semibold',
                    observability.http.errorRatePct > 5
                      ? 'text-rose-400'
                      : observability.http.errorRatePct > 1
                        ? 'text-amber-400'
                        : 'text-emerald-400',
                  )}
                >
                  %{observability.http.errorRatePct.toFixed(2)} ({formatNumber(observability.http.totalErrors)} hata)
                </span>
              </div>
            </div>

            {/* P95 / P99 Latency */}
            <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Yanıt Süresi (P95 / P99)</span>
                <span className="rounded-lg bg-amber-500/10 p-1.5 text-amber-400 ring-1 ring-amber-500/20">
                  <Timer className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-white tracking-tight">
                  {formatNumber(observability.http.p95Ms)}
                  <span className="text-sm font-normal text-slate-400">ms</span>
                </p>
                <span className="text-xs text-slate-500">/ P99: {formatNumber(observability.http.p99Ms)}ms</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">Yavaş İstek Eşiği:</span>
                <span className="text-slate-300">{observability.http.slowThresholdMs}ms</span>
              </div>
            </div>

            {/* Domain Events / Outbox */}
            <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Domain Events / Outbox</span>
                <span className="rounded-lg bg-purple-500/10 p-1.5 text-purple-400 ring-1 ring-purple-500/20">
                  <Zap className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-white tracking-tight">
                  {formatNumber(
                    observability.domainEvents.pendingCount + observability.domainEvents.processingCount,
                  )}
                </p>
                <span className="text-xs text-slate-400">kuyrukta</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">Hatalı / Dead Letter:</span>
                <span
                  className={cn(
                    'font-semibold',
                    domainEventFailureCount > 0 ? 'text-rose-400' : 'text-emerald-400',
                  )}
                >
                  {formatNumber(domainEventFailureCount)}
                </span>
              </div>
            </div>

            {/* Worker Jobs */}
            <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Worker Sync Kuyruğu</span>
                <span className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400 ring-1 ring-emerald-500/20">
                  <Server className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-white tracking-tight">
                {formatNumber(
                  observability.workerJobs.byStatus.reduce((sum, row) => sum + row.count, 0),
                )}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">Sorunlu Job:</span>
                <span
                  className={cn(
                    'font-semibold',
                    workerProblemCount > 0 ? 'text-rose-400' : 'text-emerald-400',
                  )}
                >
                  {workerProblemCount > 0 ? `${workerProblemCount} job hata aldı` : 'Tümü Başarılı'}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────
          4. EXECUTIVE KPI CARDS (Tenant Stats)
      ───────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tenantStats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={cn(
              'group relative overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl',
              stat.border,
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {stat.label}
                </span>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
                  {formatNumber(stat.value)}
                </p>
              </div>
              <div className={cn('rounded-xl p-3 ring-1 transition-transform group-hover:scale-110', stat.iconTone)}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">{stat.subtext}</span>
                <span className="font-semibold text-slate-300">{stat.badge}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', stat.progressBar)}
                  style={{ width: `${Math.min(100, Math.max(8, stat.progress))}%` }}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-slate-500 group-hover:text-slate-300 transition-colors">
              <span>Listeyi Gör</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </section>

      {/* ─────────────────────────────────────────────
          5. PLATFORM SCALE & VOLUME CARDS
      ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Platform Genel Hacim Özeti</h2>
              <p className="text-[11px] text-slate-400">Tüm şirketlerdeki aktif kayıt ve hareket büyüklüğü</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {platformTotals.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3.5 rounded-xl border border-slate-800/90 bg-slate-950/70 p-4 transition-all hover:border-slate-700"
            >
              <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border', item.tone)}>
                <item.icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold tracking-tight text-white">
                  {formatNumber(item.value)}
                </p>
                <p className="text-xs font-medium text-slate-300">{item.label}</p>
                <p className="truncate text-[11px] text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────
          6. MAIN CONTENT SPLIT (Plan Breakdown + Recent Tenants Table)
      ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column (5 cols): Plan Distribution, Health & Quick Hub */}
        <div className="space-y-6 xl:col-span-5">
          {/* Plan Breakdown Card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Paket & Plan Dağılımı</h2>
                <p className="text-[11px] text-slate-400">Şirketlerin abonelik kademeleri</p>
              </div>
              <Link
                href="/admin/features"
                className="inline-flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                <span>Paket Ayarları</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-4">
              {planRows.map((plan) => {
                const pct = totalTenants > 0 ? Math.round((plan.count / totalTenants) * 100) : 0;
                return (
                  <div key={plan.plan} className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', plan.color)} />
                        <span className="font-semibold text-slate-200">{plan.plan}</span>
                        <span className="text-[10px] text-slate-500">({plan.tag})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{formatNumber(plan.count)}</span>
                        <span className="text-[11px] text-slate-400">({pct}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/90">
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

          {/* Tenant Health Matrix */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Tenant Sağlık Matrisi</h2>
                <p className="text-[11px] text-slate-400">Kullanım durumu ve risk analizi</p>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                %{activePct} Aktif
              </span>
            </div>

            <div className="space-y-3">
              {[
                {
                  label: 'Aktif Operasyon',
                  pct: activePct,
                  count: metrics.tenants.active,
                  desc: 'Sorunsuz üretim ve işlem yapan şirketler',
                  color: 'bg-emerald-400',
                  badge: 'Normal',
                  badgeTone: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
                },
                {
                  label: 'Deneme Sürecinde',
                  pct: trialPct,
                  count: metrics.tenants.trial,
                  desc: 'Satış temsilcisi takibindeki hesaplar',
                  color: 'bg-amber-400',
                  badge: 'Satış Takibi',
                  badgeTone: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
                },
                {
                  label: 'Askıda / Dondurulmuş',
                  pct: suspendedPct,
                  count: metrics.tenants.suspended,
                  desc: 'Ödeme veya kural ihlali incelemesinde',
                  color: 'bg-rose-400',
                  badge: 'İnceleme',
                  badgeTone: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
                },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">{row.label}</span>
                    <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-semibold', row.badgeTone)}>
                      {row.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{row.desc}</p>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div className={cn('h-full rounded-full', row.color)} style={{ width: `${row.pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-300">
                      {formatNumber(row.count)} <span className="text-slate-500">({row.pct}%)</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fast Navigation Shortcut Tiles */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
            <h2 className="text-sm font-semibold text-white mb-3">Hızlı Yönetim Araçları</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                href="/admin/tenants"
                className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition-all hover:border-slate-700 hover:bg-slate-800/40"
              >
                <div className="flex items-center justify-between">
                  <Building2 className="h-4 w-4 text-sky-400" />
                  <ArrowUpRight className="h-3 w-3 text-slate-500" />
                </div>
                <span className="text-xs font-semibold text-slate-200 mt-1">Tenant Listesi</span>
                <span className="text-[10px] text-slate-500">Filtrele & Yönet</span>
              </Link>

              <Link
                href="/admin/change-requests"
                className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition-all hover:border-slate-700 hover:bg-slate-800/40"
              >
                <div className="flex items-center justify-between">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  {pendingChangeRequests.length > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                      {pendingChangeRequests.length}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-200 mt-1">Onay Talepleri</span>
                <span className="text-[10px] text-slate-500">4-Göz Prensibi</span>
              </Link>

              <Link
                href="/admin/observability"
                className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition-all hover:border-slate-700 hover:bg-slate-800/40"
              >
                <div className="flex items-center justify-between">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <ArrowUpRight className="h-3 w-3 text-slate-500" />
                </div>
                <span className="text-xs font-semibold text-slate-200 mt-1">Canlı İzleme</span>
                <span className="text-[10px] text-slate-500">Sistem Sağlığı</span>
              </Link>

              <Link
                href="/admin/security"
                className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition-all hover:border-slate-700 hover:bg-slate-800/40"
              >
                <div className="flex items-center justify-between">
                  <ShieldCheck className="h-4 w-4 text-purple-400" />
                  <ArrowUpRight className="h-3 w-3 text-slate-500" />
                </div>
                <span className="text-xs font-semibold text-slate-200 mt-1">Güvenlik Denetimi</span>
                <span className="text-[10px] text-slate-500">Checklist & MFA</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column (7 cols): Recent Tenants & Interactive List */}
        <div className="space-y-6 xl:col-span-7">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-xl backdrop-blur-md overflow-hidden">
            {/* Table Header & Search */}
            <div className="border-b border-slate-800/80 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Son Eklenen Tenantlar</h2>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                      {recentTenants?.data?.length ?? 0} Kayıt
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Sistemdeki en güncel şirket hesapları ve anlık durumları
                  </p>
                </div>

                <Link
                  href="/admin/tenants"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors self-start sm:self-auto"
                >
                  <span>Tümünü Gör ({totalTenants})</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Instant Search Bar */}
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={tenantSearchQuery}
                  onChange={(e) => setTenantSearchQuery(e.target.value)}
                  placeholder="Bu listede şirket adı, email, slug veya ID ile ara..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 outline-none ring-red-500/30 transition-all focus:border-red-500/50 focus:ring-2"
                />
                {tenantSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTenantSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
                  >
                    Temizle
                  </button>
                )}
              </div>
            </div>

            {/* Tenant Rows */}
            {filteredRecentTenants.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-400 ring-1 ring-slate-700">
                  <Building2 className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-300">
                  {tenantSearchQuery ? 'Aramaya uygun tenant bulunamadı' : 'Henüz tenant kaydı yok'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {tenantSearchQuery
                    ? 'Farklı bir arama terimi deneyin veya tüm tenantlar sayfasına bakın.'
                    : 'Yeni bir müşteri veya şirket oluşturmak için tenant ekleme sihirbazını kullanın.'}
                </p>
                <div className="mt-4">
                  <Link
                    href="/admin/tenants"
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow transition-colors hover:bg-red-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Yeni Tenant Oluştur
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {filteredRecentTenants.map((tenant: TenantListItem) => {
                  const planStyle = PLAN_BADGE_STYLE[tenant.plan] ?? PLAN_BADGE_STYLE.STARTER;
                  return (
                    <div
                      key={tenant.id}
                      className="group flex flex-col gap-3 p-4 transition-colors hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Left: Avatar & Info */}
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-sm font-bold text-slate-200 ring-1 ring-slate-700 shadow-inner group-hover:ring-slate-500 transition-all">
                          {tenant.companyName ? tenant.companyName.charAt(0).toUpperCase() : 'T'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/tenants/${tenant.id}`}
                              className="truncate text-sm font-semibold text-white hover:text-red-400 transition-colors"
                            >
                              {tenant.companyName}
                            </Link>
                            <span className="truncate text-xs text-slate-500">({tenant.slug})</span>
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="truncate">{tenant.email}</span>
                            <span className="text-slate-600">•</span>
                            <span className="text-[11px] text-slate-500">
                              {new Date(tenant.createdAt).toLocaleDateString('tr-TR')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Badges & Quick Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center">
                        <span
                          className={cn(
                            'rounded-lg border px-2.5 py-0.5 text-xs font-semibold',
                            planStyle.badge,
                          )}
                        >
                          {PLAN_LABEL[tenant.plan] ?? tenant.plan}
                        </span>

                        <Badge variant={STATUS_VARIANT[tenant.status] ?? 'neutral'}>
                          {STATUS_LABEL[tenant.status] ?? tenant.status}
                        </Badge>

                        <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => handleCopyTenantId(tenant.id, tenant.companyName)}
                            title="Tenant ID Kopyala"
                            className="rounded-lg border border-slate-800 bg-slate-950/80 p-1.5 text-slate-400 transition-colors hover:border-slate-700 hover:text-white"
                          >
                            {copiedTenantId === tenant.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                          >
                            <span>Detay</span>
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Approvals & Security Feed Widget */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Bekleyen Onaylar & Güvenlik Akışı</h2>
                  <p className="text-[11px] text-slate-400">Kritik değişiklik talepleri ve sistem güvenlik durumu</p>
                </div>
              </div>

              <Link
                href="/admin/change-requests"
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
              >
                <span>Tüm Talepler</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {pendingChangeRequests.length === 0 ? (
              <div className="flex items-center gap-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400 ring-1 ring-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-300">Tüm Onaylar Güncel</p>
                  <p className="text-[11px] text-emerald-200/70">
                    Şu anda onay bekleyen kritik tenant veya plan değişikliği talebi bulunmamaktadır.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingChangeRequests.slice(0, 3).map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          {req.type}
                        </span>
                        <span className="text-xs font-semibold text-white">{req.targetLabel}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Talep eden: <span className="text-slate-300">{req.requestedBy.name}</span> • Gerekçe:{' '}
                        <span className="text-slate-300">{req.reason}</span>
                      </p>
                    </div>
                    <Link
                      href="/admin/change-requests"
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400"
                    >
                      <span>İncele</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
