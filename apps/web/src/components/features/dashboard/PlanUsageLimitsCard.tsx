'use client';

import { KeyRound, Package, Server, Users, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanUsage } from '@/hooks/usePlanUsage';
import type { PlanUsageMetric, PlanUsageMetricKey } from '@/services/plan-usage.service';

const ICONS: Record<PlanUsageMetricKey, React.ReactNode> = {
  users: <Users className="h-4 w-4" />,
  products: <Package className="h-4 w-4" />,
  warehouses: <Warehouse className="h-4 w-4" />,
  apiKeys: <KeyRound className="h-4 w-4" />,
  storage: <Server className="h-4 w-4" />,
};

const STATUS_TONE: Record<PlanUsageMetric['status'], string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  full: 'bg-red-500',
  unlimited: 'bg-sky-500',
};

const STATUS_TEXT: Record<PlanUsageMetric['status'], string> = {
  ok: 'Normal',
  warning: 'Yaklaşıyor',
  full: 'Dolu',
  unlimited: 'Sınırsız',
};

interface PlanUsageLimitsCardProps {
  enabled?: boolean;
}

export function PlanUsageLimitsCard({ enabled = true }: PlanUsageLimitsCardProps) {
  const { data, isLoading, isError } = usePlanUsage({ enabled });

  if (!enabled) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Plan limitleri</h2>
          <p className="mt-0.5 text-xs text-slate-500">Kullanım doluluk göstergeleri</p>
        </div>
        {data?.plan && (
          <span className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-[10px] font-semibold text-slate-300">
            {data.plan}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        {isLoading && Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-950/30" />
        ))}

        {isError && (
          <div className="col-span-full rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            Limit bilgileri alınamadı.
          </div>
        )}

        {data?.metrics.map((metric) => (
          <UsageMetricTile key={metric.key} metric={metric} />
        ))}
      </div>
    </div>
  );
}

function UsageMetricTile({ metric }: { metric: PlanUsageMetric }) {
  const progressWidth = metric.percent === null ? 100 : metric.percent;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white', STATUS_TONE[metric.status])}>
            {ICONS[metric.key]}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{metric.label}</p>
            <p className="text-xs text-slate-500">{STATUS_TEXT[metric.status]}</p>
          </div>
        </div>
        {metric.percent !== null && (
          <span className="shrink-0 rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
            %{metric.percent}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold tabular-nums text-slate-200">{formatUsageValue(metric.used, metric.unit)}</span>
          <span className="tabular-nums text-slate-500">
            {metric.limit === null ? 'Sınırsız' : formatUsageValue(metric.limit, metric.unit)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn('h-full rounded-full transition-all', STATUS_TONE[metric.status], metric.percent === null && 'opacity-50')}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      {metric.reason && (
        <p className="mt-2 line-clamp-2 text-[11px] text-red-300">{metric.reason}</p>
      )}
    </div>
  );
}

function formatUsageValue(value: number, unit: PlanUsageMetric['unit']): string {
  if (unit === 'bytes') return formatBytes(value);
  return new Intl.NumberFormat('tr-TR').format(value);
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value)} ${units[index]}`;
}
