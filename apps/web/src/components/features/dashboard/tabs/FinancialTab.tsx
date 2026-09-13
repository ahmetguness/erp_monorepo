'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import {
  TrendingUp, FileText, Users, DollarSign,
  ArrowUpRight, ArrowDownRight, Package,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import type { RevenueSummary, StockSummary, ContactBalance, KpiPreview } from '@/services/reporting.service';
import type { DashboardInvoice, DashboardInvoiceList } from '@/services/dashboard.service';
import { DashboardCard, DashboardCardHeader } from '../shared/DashboardCard';
import { SalesTargetCard } from '@/components/features/sales/SalesTargetCard';
import {
  STATUS_DOT, STATUS_LABEL,
  PIE_COLORS, TOOLTIP_STYLE,
} from '../types/dashboard.constants';
import type { CurrencyRate } from '../types/dashboard.types';

// ─────────────────────────────────────────────
// Chart size hook (local — only needed here)
// ─────────────────────────────────────────────

interface ChartSize {
  w: number;
  h: number;
}

function useChartSize(ref: React.RefObject<HTMLDivElement | null>): ChartSize | null {
  const [size, setSize] = useState<ChartSize | null>(null);

  const onResize = useCallback((entries: ResizeObserverEntry[]) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) {
      setSize((prev) =>
        prev && prev.w === Math.floor(width) && prev.h === Math.floor(height)
          ? prev
          : { w: Math.floor(width), h: Math.floor(height) },
      );
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, onResize]);

  return size;
}

// ─────────────────────────────────────────────
// Chart data types
// ─────────────────────────────────────────────

interface AreaDataPoint {
  month: string;
  gelir: number;
  gider: number;
}

interface PieDataPoint {
  name: string;
  value: number;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

export interface FinancialTabProps {
  rev: RevenueSummary | undefined;
  exp: { totalGross: number } | undefined;
  stk: StockSummary | undefined;
  bal: ContactBalance | undefined;
  invs: DashboardInvoiceList | undefined;
  tcmbUsd: CurrencyRate | undefined;
  tcmbEur: CurrencyRate | undefined;
  canReadInvoicing: boolean;
  pinnedKpis: KpiPreview[];
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function FinancialTab({
  rev,
  exp,
  stk,
  bal,
  invs,
  tcmbUsd,
  tcmbEur,
  canReadInvoicing,
  pinnedKpis,
}: FinancialTabProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const areaSize = useChartSize(areaRef);

  const profit = (rev?.totalGross ?? 0) - (exp?.totalGross ?? 0);

  const areaData: AreaDataPoint[] = [
    { month: 'Oca', gelir: 28_000, gider: 18_000 },
    { month: 'Şub', gelir: 35_000, gider: 22_000 },
    { month: 'Mar', gelir: rev?.totalGross ?? 40_000, gider: exp?.totalGross ?? 25_000 },
  ].filter((d) => d.gelir > 0 || d.gider > 0);

  const pieData: PieDataPoint[] = (() => {
    if (!invs?.data) return [];
    const counts: Record<string, number> = {};
    invs.data.forEach((inv: DashboardInvoice) => {
      counts[inv.status] = (counts[inv.status] ?? 0) + 1;
    });
    return Object.entries(counts).map(([status, value]) => ({
      name: STATUS_LABEL[status] ?? status,
      value,
    }));
  })();

  return (
    <div className="space-y-5">
      {/* ── Pinned KPIs ── */}
      {pinnedKpis.length > 0 && (
        <DashboardCard>
          <DashboardCardHeader
            icon={<TrendingUp className="w-4 h-4 text-sky-400" />}
            title="Sabit KPI Kartları"
          />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {pinnedKpis.slice(0, 4).map((kpi) => (
              <div
                key={`${kpi.config.dataset}:${kpi.config.metric}:${kpi.config.dateRangePreset}`}
                className="rounded-xl border border-slate-800 bg-slate-950/35 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {kpi.metricLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{kpi.datasetLabel}</p>
                  </div>
                  <span className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                    {kpi.chartType}
                  </span>
                </div>
                <p className="mt-3 truncate text-xl font-bold text-white">{kpi.formattedValue}</p>
                {(kpi.period.from || kpi.period.to) && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    {kpi.period.from ?? '—'} / {kpi.period.to ?? '—'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </DashboardCard>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Bu Ay Gelir</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">
                {formatCurrency(rev?.totalGross ?? 0)}
              </p>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-red-500/10 shrink-0">
              <TrendingUp className="w-5 h-5 text-red-400 rotate-180" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Bu Ay Gider</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">
                {formatCurrency(exp?.totalGross ?? 0)}
              </p>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-sky-500/10 shrink-0">
              <DollarSign className="w-5 h-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Net Kar/Zarar</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">
                {formatCurrency(profit)}
              </p>
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1 px-1.5 py-0.5 rounded-full',
                  profit >= 0
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400',
                )}
              >
                {profit >= 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {profit >= 0 ? 'Kârlı' : 'Zararlı'}
              </span>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-violet-500/10 shrink-0">
              <Package className="w-5 h-5 text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Stok Değeri</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">
                {formatCurrency(stk?.summary.totalStockValue ?? 0)}
              </p>
            </div>
          </div>
        </DashboardCard>
      </div>

      {/* ── Sales Target ── */}
      <SalesTargetCard enabled={canReadInvoicing} />

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardCard>
          <DashboardCardHeader
            icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
            title="Gelir & Gider Trendi"
          />
          <div ref={areaRef} className="px-4 pb-4 pt-2" style={{ height: 280 }}>
            {areaSize && (
              <AreaChart width={areaSize.w} height={areaSize.h} data={areaData}>
                <defs>
                  <linearGradient id="gGe" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gGi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="gelir" name="Gelir" stroke="#10b981" fill="url(#gGe)" strokeWidth={2} />
                <Area type="monotone" dataKey="gider" name="Gider" stroke="#ef4444" fill="url(#gGi)" strokeWidth={2} />
              </AreaChart>
            )}
          </div>
        </DashboardCard>

        <DashboardCard>
          <DashboardCardHeader
            icon={<FileText className="w-4 h-4 text-blue-400" />}
            title="Fatura Durumları"
          />
          <div className="p-4 flex flex-col sm:flex-row items-center justify-center gap-6" style={{ height: 280 }}>
            {pieData.length > 0 ? (
              <>
                <PieChart width={220} height={220}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
                <div className="flex flex-col gap-2.5 min-w-[100px]">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-xs text-slate-400 whitespace-nowrap">{d.name}</span>
                      <span className="text-xs font-semibold text-slate-200 ml-auto tabular-nums">
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Fatura verisi yok</div>
            )}
          </div>
        </DashboardCard>
      </div>

      {/* ── Invoices + Balance / Currency ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardCard className="flex flex-col max-h-[420px]">
          <DashboardCardHeader
            icon={<FileText className="w-4 h-4 text-slate-400" />}
            title="Son Faturalar"
          />
          <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
            {invs?.data?.length ? (
              invs.data.map((inv: DashboardInvoice) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/30 transition-colors"
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[inv.status])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium">{inv.number}</p>
                    <p className="text-xs text-slate-500 truncate">{inv.contact?.name ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-white tabular-nums">
                      {formatCurrency(inv.totalGross)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">Fatura bulunamadı</div>
            )}
          </div>
        </DashboardCard>

        <div className="flex flex-col gap-4">
          <DashboardCard>
            <DashboardCardHeader
              icon={<Users className="w-4 h-4 text-slate-400" />}
              title="Cari Bakiye Özeti"
            />
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/5 rounded-xl p-4 text-center border border-emerald-500/10">
                <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1">Alacak</p>
                <p className="text-lg font-bold text-emerald-400 tabular-nums">
                  {formatCurrency(bal?.summary.totalReceivable ?? 0)}
                </p>
              </div>
              <div className="bg-red-500/5 rounded-xl p-4 text-center border border-red-500/10">
                <p className="text-[10px] text-red-500 uppercase tracking-wider mb-1">Borç</p>
                <p className="text-lg font-bold text-red-400 tabular-nums">
                  {formatCurrency(bal?.summary.totalPayable ?? 0)}
                </p>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard>
            <DashboardCardHeader
              icon={<DollarSign className="w-4 h-4 text-amber-400" />}
              title="Döviz Kurları (TCMB)"
            />
            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-500 block mb-1">USD / TRY</span>
                <span className="text-lg font-bold text-white tabular-nums">
                  ₺{tcmbUsd?.forexSelling?.toFixed(4) ?? '—'}
                </span>
              </div>
              <div className="border-l border-slate-800 pl-4">
                <span className="text-xs text-slate-500 block mb-1">EUR / TRY</span>
                <span className="text-lg font-bold text-white tabular-nums">
                  ₺{tcmbEur?.forexSelling?.toFixed(4) ?? '—'}
                </span>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
