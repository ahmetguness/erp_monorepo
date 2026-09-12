'use client';

import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Database,
  Radio,
  Search,
  Server,
  ShieldCheck,
  Timer,
  RefreshCw,
  Cpu,
  Globe,
  Flame,
  CheckCircle2,
  XCircle,
  BarChart3,
  Zap,
} from 'lucide-react';
import {
  getOperationalObservability,
  searchOperationalObservability,
  type EndpointLatencySnapshot,
  type ErrorRateTrendSnapshot,
} from '@/services/admin.service';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { OperationInterventionPanel } from '@/components/features/admin/operations/OperationInterventionPanel';
import { PersistentObservabilityPanel } from '@/components/features/admin/observability/PersistentObservabilityPanel';

const numberFormatter = new Intl.NumberFormat('tr-TR');
const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDateTime(value: string): string {
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  POST: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  PUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  PATCH: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

function MetricPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border px-3 py-2 transition-colors',
      highlight
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-slate-800/80 bg-slate-950/60 text-slate-200'
    )}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-xs font-bold">{value}</p>
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: EndpointLatencySnapshot }) {
  const methodColor = METHOD_COLORS[endpoint.method.toUpperCase()] || 'bg-slate-800 text-slate-300 border-slate-700';
  const hasErrors = endpoint.errorRatePct > 0;

  return (
    <div className="grid gap-3 border-b border-slate-800/60 p-4 transition-colors hover:bg-slate-800/30 last:border-0 md:grid-cols-[minmax(0,1.5fr)_80px_80px_80px_80px] md:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold border font-mono', methodColor)}>
            {endpoint.method}
          </span>
          <span className="truncate text-xs font-semibold text-slate-200 font-mono" title={endpoint.path}>
            {endpoint.path}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>{formatNumber(endpoint.count)} istek</span>
          <span className={cn('font-medium', hasErrors ? 'text-rose-400' : 'text-emerald-400')}>
            %{endpoint.errorRatePct} hata ({formatNumber(endpoint.errorCount)})
          </span>
        </div>
      </div>

      <MetricPill label="Ortalama" value={`${formatNumber(endpoint.avgMs)}ms`} />
      <MetricPill label="p95" value={`${formatNumber(endpoint.p95Ms)}ms`} />
      <MetricPill label="p99" value={`${formatNumber(endpoint.p99Ms)}ms`} highlight={endpoint.p99Ms > 1000} />
      <MetricPill label="Maks" value={`${formatNumber(endpoint.maxMs)}ms`} highlight={endpoint.maxMs > 2000} />
    </div>
  );
}

function ErrorTrend({ rows }: { rows: ErrorRateTrendSnapshot[] }) {
  const maxRequests = Math.max(1, ...rows.map((row) => row.requestCount));
  const totalRequests = rows.reduce((acc, r) => acc + r.requestCount, 0);
  const totalErrors = rows.reduce((acc, r) => acc + r.errorCount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-sky-500" />
            <span>Toplam İstek: <strong>{formatNumber(totalRequests)}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-rose-500" />
            <span>Hatalar: <strong className="text-rose-400">{formatNumber(totalErrors)}</strong></span>
          </span>
        </div>
        <span className="text-[11px] text-slate-500">Son Saatler</span>
      </div>

      <div className="flex h-36 items-end gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
        {rows.map((row) => {
          const height = Math.max(6, Math.round((row.requestCount / maxRequests) * 100));
          const errorHeight =
            row.requestCount > 0
              ? Math.max(0, Math.round((row.errorCount / row.requestCount) * height))
              : 0;

          return (
            <div key={row.bucketStart} className="group relative flex min-w-0 flex-1 flex-col items-center gap-1.5 h-full justify-end">
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute bottom-full mb-2 hidden -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-200 shadow-lg group-hover:block z-20 whitespace-nowrap">
                <p className="font-semibold text-white">{formatDateTime(row.bucketStart)}</p>
                <p>{row.requestCount} İstek · {row.errorCount} Hata</p>
              </div>

              <div className="flex h-24 w-full items-end justify-center rounded bg-slate-900/60">
                <div
                  className="relative w-full rounded-t bg-gradient-to-t from-sky-600/70 to-sky-400/80 transition-all duration-300 group-hover:from-sky-500 group-hover:to-sky-300"
                  style={{ height: `${height}%` }}
                >
                  {errorHeight > 0 && (
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-rose-500 transition-all"
                      style={{ height: `${errorHeight}%` }}
                    />
                  )}
                </div>
              </div>
              <span className="text-[9px] font-mono text-slate-500 truncate w-full text-center">
                {row.bucketStart.slice(11, 16)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OperationalList({
  title,
  empty,
  icon,
  badge,
  children,
}: {
  title: string;
  empty: string;
  icon?: React.ReactNode;
  badge?: string | number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-semibold text-white">{title}</h3>
          </div>
          {badge !== undefined && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
              {badge}
            </span>
          )}
        </div>
        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
          {Array.isArray(children) && children.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
              <span>{empty}</span>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminObservabilityPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('query')?.trim() ?? '';
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab === 'intervention' || requestedTab === 'historical'
    ? requestedTab
    : 'live';
  const [activeTab, setActiveTab] = useState<'live' | 'intervention' | 'historical'>(initialTab);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);

  const observability = useQuery({
    queryKey: ['admin', 'observability', 'detail'],
    queryFn: getOperationalObservability,
    refetchInterval: 15_000,
  });

  const search = useQuery({
    queryKey: ['admin', 'observability', 'search', query],
    queryFn: () => searchOperationalObservability(query),
    enabled: query.length >= 6,
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  const data = observability.data;
  const workerTotal = data ? data.workerJobs.byStatus.reduce((sum, item) => sum + item.count, 0) : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Gözlemlenebilirlik & Operasyon Merkezi
            </h1>
            <p className="text-xs text-slate-400">
              HTTP gecikmeleri, hata oranları, domain event hatları ve worker kuyruklarını canlı izleyin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-medium">Canlı Veri</span>
            <span className="text-slate-500 text-[10px]">(15s)</span>
          </div>

          <Button
            variant="outline"
            size="md"
            onClick={() => observability.refetch()}
            loading={observability.isFetching}
            leftIcon={<RefreshCw className={cn('h-4 w-4', observability.isFetching && 'animate-spin')} />}
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('live')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            activeTab === 'live'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200',
          )}
        >
          <Activity className="h-4 w-4" />
          <span>Canlı Metrikler & Telemetri</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('intervention')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            activeTab === 'intervention'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200',
          )}
        >
          <Zap className="h-4 w-4" />
          <span>Operasyonel Müdahale</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('historical')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            activeTab === 'historical'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200',
          )}
        >
          <Database className="h-4 w-4" />
          <span>SLO & Tarihsel Analiz</span>
        </button>
      </div>

      {/* Tab 1: Live Metrics */}
      {activeTab === 'live' && (
        <div className="space-y-6">
          {/* Top 5 Primary KPI Cards */}
          {data && (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
              {/* Metric 1: HTTP Latency */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">HTTP p95 / p99</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                    <Timer className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-bold text-white tracking-tight">
                  {formatNumber(data.http.p95Ms)}ms <span className="text-slate-500 font-normal text-sm">/</span> {formatNumber(data.http.p99Ms)}ms
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {formatNumber(data.http.totalRequests)} toplam istek · Eşik: {formatNumber(data.http.slowThresholdMs)}ms
                </div>
              </div>

              {/* Metric 2: Error Rate */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Hata Oranı (5xx)</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={cn('text-2xl font-bold', data.http.errorRatePct > 1 ? 'text-rose-400' : 'text-emerald-400')}>
                    %{data.http.errorRatePct}
                  </span>
                  <span className="text-xs text-slate-400">
                    ({formatNumber(data.http.totalErrors)} Hata)
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {data.http.errorRatePct === 0 ? (
                    <span className="text-emerald-400 font-medium">Sistem kararlı çalışıyor</span>
                  ) : (
                    <span className="text-amber-400 font-medium">Sunucu hataları mevcut</span>
                  )}
                </div>
              </div>

              {/* Metric 3: Domain Events */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Domain Event Hattı</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                    <Radio className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {formatNumber(data.domainEvents.pendingCount + data.domainEvents.processingCount)}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {data.domainEvents.deadLetterCount > 0 ? (
                    <span className="text-rose-400 font-medium">{data.domainEvents.deadLetterCount} Dead-Letter</span>
                  ) : (
                    <span className="text-emerald-400">0 Dead-Letter</span>
                  )} · {data.domainEvents.failedCount} Retry
                </div>
              </div>

              {/* Metric 4: Worker Queue */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Worker Kuyruğu</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                    <Server className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {formatNumber(workerTotal)} <span className="text-xs font-normal text-slate-400">İş</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {data.workerJobs.retryScheduledCount} Zamanlanmış · {data.workerJobs.deadLetterCount} Başarısız
                </div>
              </div>

              {/* Metric 5: Authorization */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">RBAC Yetkilendirme</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {formatNumber(data.authorization.avgDurationMs)}ms
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {data.authorization.avgQueryCount} sorgu/istek · {data.authorization.deniedCount} red
                </div>
              </div>
            </div>
          )}

          {/* Trace Search Bar */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur">
            <form onSubmit={onSearch} className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="requestId veya correlationId ile uçtan uca izleme ara…"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-emerald-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={searchInput.trim().length < 6}
                leftIcon={<Search className="h-4 w-4" />}
              >
                İzi Getir
              </Button>
            </form>

            {query && search.data && (
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 border-t border-slate-800/80 pt-3">
                <MetricPill label="Yavaş Endpoint" value={formatNumber(search.data.slowEndpoints.length)} highlight={search.data.slowEndpoints.length > 0} />
                <MetricPill label="Hata Kaydı" value={formatNumber(search.data.errors.length)} highlight={search.data.errors.length > 0} />
                <MetricPill label="Yavaş DB Sorgusu" value={formatNumber(search.data.slowQueries.length)} highlight={search.data.slowQueries.length > 0} />
                <MetricPill label="Eşleşen Audit Log" value={formatNumber(search.data.auditLogs.length)} />
              </div>
            )}
          </div>

          {/* Error Trend & Latency Distribution */}
          {data && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              {/* Error Rate Trend */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur xl:col-span-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-sky-400" />
                    <h2 className="text-sm font-semibold text-white">İstek ve Hata Trendi</h2>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Son güncelleme: {formatDateTime(data.runtime.generatedAt)}
                  </span>
                </div>
                <ErrorTrend rows={data.http.errorRateTrend} />
              </div>

              {/* Endpoint Latency Table */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-sm backdrop-blur xl:col-span-7 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">Endpoint Gecikme Dağılımı</h2>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                    {data.http.endpoints.length} Endpoint
                  </span>
                </div>

                <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-800/40">
                  {data.http.endpoints.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Henüz kaydedilmiş endpoint metriği bulunmuyor.
                    </div>
                  ) : (
                    data.http.endpoints.map((endpoint) => (
                      <EndpointRow key={endpoint.key} endpoint={endpoint} />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Slow Queries, Domain Events & Worker Jobs 3-Column Grid */}
          {data && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {/* Slow Queries */}
              <OperationalList
                title="Yavaş Veritabanı Sorguları"
                empty="Kritik yavaşlıkta sorgu tespit edilmedi"
                badge={data.slowQueries.recent.length}
                icon={<Database className="h-4 w-4 text-amber-400" />}
              >
                {data.slowQueries.recent.map((query) => (
                  <div
                    key={`${query.occurredAt}:${query.model}:${query.action}`}
                    className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 font-mono">
                        {query.model ?? 'Unknown'}.{query.action}()
                      </span>
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                        {formatNumber(query.durationMs)}ms
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{formatDateTime(query.occurredAt)}</p>
                  </div>
                ))}
              </OperationalList>

              {/* Domain Event Failures */}
              <OperationalList
                title="Domain Event Hataları"
                empty="Başarısız event kaydı bulunmuyor"
                badge={data.domainEvents.recentFailures.length}
                icon={<Radio className="h-4 w-4 text-rose-400" />}
              >
                {data.domainEvents.recentFailures.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200 truncate">{event.name}</span>
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
                        {event.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{event.tenantName ?? event.tenantId}</span>
                      <span className="font-mono text-slate-500">{event.attempts} deneme</span>
                    </div>
                  </div>
                ))}
              </OperationalList>

              {/* Worker Problem Jobs */}
              <OperationalList
                title="Sorunlu Worker İşleri"
                empty="Kuyrukta bekleyen hatalı iş yok"
                badge={data.workerJobs.recentProblemJobs.length}
                icon={<Server className="h-4 w-4 text-violet-400" />}
              >
                {data.workerJobs.recentProblemJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200 truncate">{job.jobType}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                        {job.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {job.errorMessage ?? `${job.processedCount} işlendi`}
                    </p>
                  </div>
                ))}
              </OperationalList>
            </div>
          )}

          {/* External Services Telemetry */}
          {data && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-sky-400" />
                  <h3 className="text-sm font-semibold text-white">Dış Servis ve API Çağrıları</h3>
                </div>
                <span className="text-xs text-slate-400">
                  {data.externalServices.length} Entegrasyon
                </span>
              </div>

              {data.externalServices.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Henüz dış servis çağrısı gözlenmedi.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {data.externalServices.map((service) => (
                    <div
                      key={service.service}
                      className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 text-xs truncate">
                          {service.service}
                        </span>
                        <span className="font-mono text-xs font-bold text-sky-400">
                          {service.avgDurationMs}ms
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
                        <span>{formatNumber(service.requestCount)} Çağrı</span>
                        <span className={service.errorCount > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                          {service.errorCount} Hata
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Telemetry Stack & Central Alarms */}
          {data && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Telemetry Stack Status */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur lg:col-span-4 space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                  <Cpu className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Telemetri Altyapısı</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                    <span className="text-slate-300">Metric Store</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {data.telemetry.persistence.mode} ({data.telemetry.persistence.durable ? 'Kalıcı' : 'Bellek'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                    <span className="text-slate-300">Sentry Hata İzleme</span>
                    <span className={cn('font-semibold', data.telemetry.sentry.enabled ? 'text-emerald-400' : 'text-slate-500')}>
                      {data.telemetry.sentry.enabled ? 'Aktif' : 'Devre Dışı'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                    <span className="text-slate-300">OpenTelemetry</span>
                    <span className={cn('font-semibold', data.telemetry.openTelemetry.enabled ? 'text-emerald-400' : 'text-slate-500')}>
                      {data.telemetry.openTelemetry.enabled ? 'Aktif' : 'Devre Dışı'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                    <span className="text-slate-300">Prometheus ({data.telemetry.prometheus.path})</span>
                    <span className={cn('font-semibold', data.telemetry.prometheus.enabled ? 'text-emerald-400' : 'text-slate-500')}>
                      {data.telemetry.prometheus.enabled ? 'Aktif (Korumalı)' : 'Devre Dışı'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Central Alarms */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 shadow-sm backdrop-blur lg:col-span-8 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">Merkezi Alarm Kuralları</h3>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                    {data.alerts.filter((a) => a.active).length} Tetiklendi
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.alerts.map((alert) => (
                    <div
                      key={alert.key}
                      className={cn(
                        'rounded-xl border p-3.5 space-y-1 transition-colors',
                        alert.active
                          ? 'border-rose-500/40 bg-rose-500/10'
                          : 'border-slate-800/90 bg-slate-950/60',
                      )}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                        {alert.key.replaceAll('_', ' ')}
                      </p>
                      <div className="flex items-baseline justify-between">
                        <span className={cn('text-lg font-bold', alert.active ? 'text-rose-300' : 'text-emerald-300')}>
                          {alert.value}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Eşik: {alert.threshold} {alert.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Operational Interventions */}
      {activeTab === 'intervention' && (
        <div className="space-y-6">
          {data && (
            <OperationInterventionPanel
              events={data.domainEvents.recentFailures}
              jobs={data.workerJobs.recentProblemJobs}
            />
          )}
        </div>
      )}

      {/* Tab 3: Historical Analytics & SLO */}
      {activeTab === 'historical' && (
        <div className="space-y-6">
          <PersistentObservabilityPanel />
        </div>
      )}
    </div>
  );
}
