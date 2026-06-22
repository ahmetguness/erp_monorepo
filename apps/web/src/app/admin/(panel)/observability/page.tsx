'use client';

import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Radio,
  Search,
  Server,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import {
  getOperationalObservability,
  searchOperationalObservability,
  type EndpointLatencySnapshot,
  type ErrorRateTrendSnapshot,
  type OperationalObservability,
} from '@/services/admin.service';
import { cn } from '@/lib/utils';

const numberFormatter = new Intl.NumberFormat('tr-TR');
const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

function StatTile({ label, value, detail, icon, tone }: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-white">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
        </div>
        <div className={cn('rounded-lg p-2 ring-1', tone)}>{icon}</div>
      </div>
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: EndpointLatencySnapshot }) {
  return (
    <div className="grid gap-3 border-b border-slate-800 px-4 py-3 last:border-0 md:grid-cols-[minmax(0,1fr)_90px_90px_90px_90px] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-200">{endpoint.method} {endpoint.path}</p>
        <p className="mt-1 text-xs text-slate-500">{formatNumber(endpoint.count)} istek / %{endpoint.errorRatePct} hata</p>
      </div>
      <MetricPill label="avg" value={`${formatNumber(endpoint.avgMs)}ms`} />
      <MetricPill label="p95" value={`${formatNumber(endpoint.p95Ms)}ms`} />
      <MetricPill label="p99" value={`${formatNumber(endpoint.p99Ms)}ms`} />
      <MetricPill label="max" value={`${formatNumber(endpoint.maxMs)}ms`} />
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-2">
      <p className="text-[10px] uppercase text-slate-600">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function ErrorTrend({ rows }: { rows: ErrorRateTrendSnapshot[] }) {
  const maxRequests = Math.max(1, ...rows.map((row) => row.requestCount));
  return (
    <div className="flex h-36 items-end gap-1.5">
      {rows.map((row) => {
        const height = Math.max(4, Math.round((row.requestCount / maxRequests) * 100));
        const errorHeight = row.requestCount > 0 ? Math.max(0, Math.round((row.errorCount / row.requestCount) * height)) : 0;
        return (
          <div key={row.bucketStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end rounded bg-slate-950">
              <div className="relative w-full rounded bg-sky-500/40" style={{ height: `${height}%` }}>
                {errorHeight > 0 && <div className="absolute bottom-0 w-full rounded bg-red-400" style={{ height: `${errorHeight}%` }} />}
              </div>
            </div>
            <span className="text-[10px] text-slate-600">{formatDateTime(row.bucketStart).slice(-5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function HealthTone({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold',
      active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400',
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-300' : 'bg-slate-500')} />
      {label}
    </span>
  );
}

function OperationsPanel({ data }: { data: OperationalObservability }) {
  const workerTotal = data.workerJobs.byStatus.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="HTTP p95 / p99" value={`${formatNumber(data.http.p95Ms)}ms / ${formatNumber(data.http.p99Ms)}ms`} detail={`${formatNumber(data.http.totalRequests)} toplam istek`} icon={<Timer className="h-4 w-4" />} tone="bg-sky-500/10 text-sky-300 ring-sky-500/20" />
        <StatTile label="Error rate" value={`%${data.http.errorRatePct}`} detail={`${formatNumber(data.http.totalErrors)} server hatası`} icon={<AlertTriangle className="h-4 w-4" />} tone="bg-red-500/10 text-red-300 ring-red-500/20" />
        <StatTile label="Domain event" value={formatNumber(data.domainEvents.failedCount + data.domainEvents.deadLetterCount)} detail={`${formatNumber(data.domainEvents.deadLetterCount)} dead-letter`} icon={<Radio className="h-4 w-4" />} tone="bg-amber-500/10 text-amber-300 ring-amber-500/20" />
        <StatTile label="Worker queue" value={formatNumber(workerTotal)} detail={`${formatNumber(data.workerJobs.recentProblemJobs.length)} takip kaydı`} icon={<Server className="h-4 w-4" />} tone="bg-emerald-500/10 text-emerald-300 ring-emerald-500/20" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Error Trend</h2>
            <span className="text-xs text-slate-500">{formatDateTime(data.runtime.generatedAt)}</span>
          </div>
          <ErrorTrend rows={data.http.errorRateTrend} />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 xl:col-span-3">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Endpoint Latency</h2>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {data.http.endpoints.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Henüz endpoint metriği yok.</p>
            ) : (
              data.http.endpoints.map((endpoint) => <EndpointRow key={endpoint.key} endpoint={endpoint} />)
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <OperationalList title="Slow Query" empty="Yavaş sorgu yok">
          {data.slowQueries.recent.map((query) => (
            <div key={`${query.occurredAt}:${query.model}:${query.action}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-sm font-medium text-slate-200">{query.model ?? 'Unknown'} / {query.action}</p>
              <p className="mt-1 text-xs text-slate-500">{formatNumber(query.durationMs)}ms / {formatDateTime(query.occurredAt)}</p>
            </div>
          ))}
        </OperationalList>
        <OperationalList title="Domain Event Failure" empty="Event hatası yok">
          {data.domainEvents.recentFailures.map((event) => (
            <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-200">{event.name}</p>
                <span className="rounded bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">{event.status}</span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{event.tenantName ?? event.tenantId} / {event.attempts} deneme</p>
            </div>
          ))}
        </OperationalList>
        <OperationalList title="Worker Queue" empty="Sorunlu job yok">
          {data.workerJobs.recentProblemJobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-200">{job.jobType}</p>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{job.status}</span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">{job.tenantName ?? job.tenantId} / {job.errorMessage ?? `${job.processedCount} işlenen`}</p>
            </div>
          ))}
        </OperationalList>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <HealthTone active={data.telemetry.persistence.durable} label={`Metric store: ${data.telemetry.persistence.mode}`} />
          <HealthTone active={data.telemetry.sentry.enabled} label="Sentry" />
          <HealthTone active={data.telemetry.openTelemetry.enabled} label="OpenTelemetry" />
        </div>
        <p className="text-xs text-slate-500">{data.telemetry.persistence.detail}</p>
      </section>
    </div>
  );
}

function OperationalList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">{title}</h2>
      <div className="space-y-2">
        {Array.isArray(children) && children.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{empty}</p> : children}
      </div>
    </div>
  );
}

export default function AdminObservabilityPage() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
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

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-300 ring-1 ring-red-500/20">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Admin operasyon</p>
              <h1 className="mt-1 text-xl font-semibold text-white">Observability Dashboard</h1>
              <p className="mt-1 text-sm text-slate-400">Runtime, event, worker ve audit izleri.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <HealthTone active={Boolean(observability.data?.runtime.marketplaceWorkerEnabled)} label="Marketplace worker" />
            <HealthTone active={Boolean(observability.data)} label={observability.data?.runtime.appRole ?? 'api'} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <form onSubmit={onSearch} className="flex flex-col gap-3 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="requestId veya correlationId"
              className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 text-sm text-slate-100 outline-none transition-colors focus:border-red-500/50"
            />
          </div>
          <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400">
            <Search className="h-4 w-4" />
            Ara
          </button>
        </form>
        {query && search.data && (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
            <MetricPill label="slow endpoint" value={formatNumber(search.data.slowEndpoints.length)} />
            <MetricPill label="error" value={formatNumber(search.data.errors.length)} />
            <MetricPill label="slow query" value={formatNumber(search.data.slowQueries.length)} />
            <MetricPill label="audit log" value={formatNumber(search.data.auditLogs.length)} />
          </div>
        )}
      </section>

      {observability.isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />)}
        </div>
      )}

      {observability.data && <OperationsPanel data={observability.data} />}

      {observability.isError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-5">
          <div className="flex items-center gap-2 text-red-200">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold">Observability verisi alınamadı.</p>
          </div>
        </div>
      )}

      {search.data && search.data.auditLogs.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <h2 className="text-sm font-semibold text-white">Audit Eşleşmeleri</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {search.data.auditLogs.map((log) => (
              <div key={log.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_120px_120px_140px]">
                <span className="truncate text-slate-200">{log.module} / {log.entityType}</span>
                <span className="text-slate-500">{log.action}</span>
                <span className="truncate text-slate-500">{log.entityId}</span>
                <span className="text-slate-500">{formatDateTime(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-300" />
            <h2 className="text-sm font-semibold text-white">Metric Store</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500">{observability.data?.telemetry.persistence.detail ?? 'Snapshot bekleniyor.'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-white">Refresh</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500">{observability.data ? `Son üretim: ${formatDateTime(observability.data.runtime.generatedAt)}` : 'Snapshot bekleniyor.'}</p>
        </div>
      </section>
    </div>
  );
}
