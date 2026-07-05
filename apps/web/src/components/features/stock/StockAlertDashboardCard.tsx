'use client';

import { AlertTriangle, CheckCircle2, PackageX, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useStockAlerts } from '@/hooks/useStock';
import { cn } from '@/lib/utils';
import type { StockAlertItem } from '@/services/stock.service';

interface StockAlertDashboardCardProps {
  enabled: boolean;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function severityLabel(item: StockAlertItem): string {
  if (item.severity === 'OUT_OF_STOCK') return 'Stok yok';
  if (item.severity === 'RUNNING_OUT') return 'Bitmek uzere';
  return 'Minimum alti';
}

function severityClass(item: StockAlertItem): string {
  if (item.severity === 'OUT_OF_STOCK') return 'bg-red-500/10 text-red-300';
  if (item.severity === 'RUNNING_OUT') return 'bg-sky-500/10 text-sky-300';
  return 'bg-amber-500/10 text-amber-300';
}

export function StockAlertDashboardCard({ enabled }: StockAlertDashboardCardProps) {
  const { data, isLoading } = useStockAlerts(5, { enabled });

  if (!enabled) return null;

  const items = data?.items ?? [];
  const hasAlerts = (data?.summary.alertCount ?? 0) > 0;

  return (
    <section className={cn(
      'rounded-2xl border p-4 shadow-lg ring-1 ring-white/[0.03]',
      hasAlerts ? 'border-amber-500/20 bg-amber-500/[0.04]' : 'border-slate-800 bg-slate-900',
    )}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            hasAlerts ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300',
          )}>
            {hasAlerts ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">Akilli stok uyarilari</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Tek depo stoklari minimum esik, bitis riski ve satis hizina gore izlenir.
            </p>
            {data?.summary.singleWarehouse && data.summary.warehouseName && (
              <p className="mt-1 text-[11px] text-slate-600">Depo: {data.summary.warehouseName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold tabular-nums',
            hasAlerts ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-500',
          )}>
            {isLoading ? '-' : data?.summary.alertCount ?? 0}
          </span>
          <Link
            href="/dashboard/stock/levels"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-700 px-3 text-xs font-medium text-slate-300 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-200"
          >
            Stoklari Ac
          </Link>
        </div>
      </div>

      <div className="mt-4">
        {!isLoading && hasAlerts && data && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-red-500/10 bg-red-500/[0.04] px-3 py-2">
              <p className="text-[10px] text-red-300">Stok yok</p>
              <p className="mt-1 text-base font-semibold text-red-200">{data.summary.outOfStockCount}</p>
            </div>
            <div className="rounded-lg border border-amber-500/10 bg-amber-500/[0.04] px-3 py-2">
              <p className="text-[10px] text-amber-300">Min. alti</p>
              <p className="mt-1 text-base font-semibold text-amber-200">{data.summary.lowStockCount}</p>
            </div>
            <div className="rounded-lg border border-sky-500/10 bg-sky-500/[0.04] px-3 py-2">
              <p className="text-[10px] text-sky-300">Bitiyor</p>
              <p className="mt-1 text-base font-semibold text-sky-200">{data.summary.runningOutCount}</p>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="grid gap-2 md:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-800/60" />)}
          </div>
        ) : items.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-3">
            {items.slice(0, 3).map((item) => (
              <Link
                key={item.productId}
                href={item.href}
                className="rounded-xl border border-amber-500/15 bg-slate-950/35 p-3 transition-colors hover:border-amber-500/35 hover:bg-amber-500/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{item.productName}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{item.productCode}</p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold',
                    severityClass(item),
                  )}>
                    {severityLabel(item)}
                  </span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Mevcut <span className="font-semibold text-slate-200">{formatQuantity(item.currentQuantity)}</span>
                    {item.unitCode ? ` ${item.unitCode}` : ''}
                  </p>
                  <p className="text-xs text-amber-200">Min {formatQuantity(item.minStockLevel)}</p>
                </div>
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <TrendingUp className="h-3 w-3" />
                      Gunluk satis
                    </span>
                    <span className="font-mono text-slate-300">{formatQuantity(item.dailySalesVelocity)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500">Tahmini bitis</span>
                    <span className="font-mono text-slate-300">
                      {item.estimatedDaysToStockout === null ? '-' : `${item.estimatedDaysToStockout} gun`}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500">Siparis onerisi</span>
                    <span className="font-mono font-semibold text-emerald-300">
                      {formatQuantity(item.reorderSuggestedQuantity)}
                      {item.unitCode ? ` ${item.unitCode}` : ''}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] px-3 py-3 text-sm text-emerald-200">
            <PackageX className="h-4 w-4" />
            Minimum stok altinda veya bitmek uzere olan urun yok.
          </div>
        )}
      </div>
    </section>
  );
}
