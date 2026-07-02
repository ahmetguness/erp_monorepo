'use client';

import { useCashflowForecast } from '@/hooks/useReporting';
import { cn, formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, ArrowRight, Wallet, Calendar, AlertCircle } from 'lucide-react';

export function CashflowForecastPanel() {
  const { data, isLoading, error } = useCashflowForecast();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* KPI Card Skeleton */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-28 w-72" />

        {/* Grid Skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm">Nakit akış verileri yüklenirken bir hata oluştu. Lütfen tekrar deneyin.</p>
      </div>
    );
  }

  const { startingBalance, periods } = data;

  return (
    <div className="space-y-6">
      {/* Starting Balance Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 rounded-2xl p-6 max-w-md shadow-2xl group">
        <div className="absolute inset-0 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Wallet className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Güncel Likit Bakiye
          </span>
        </div>
        <h2 className="text-3xl font-black text-white tracking-tight">
          {formatCurrency(startingBalance)}
        </h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Tüm aktif kasa ve banka hesaplarınızın anlık net bakiyesi.
        </p>
      </div>

      {/* Forecast Periods Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {periods.map((p, idx) => {
          const isPositive = p.netFlow >= 0;
          return (
            <div
              key={idx}
              className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700/80 transition-all duration-300 shadow-lg flex flex-col justify-between"
            >
              {/* Top Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-200 text-sm tracking-wide">{p.label}</h3>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {p.range}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-800/60 text-slate-400">
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>

                {/* Expected Ending Balance */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Tahmini Dönem Sonu Bakiye
                  </span>
                  <p className="text-2xl font-black text-white tracking-tight">
                    {formatCurrency(p.endingBalance)}
                  </p>
                </div>

                {/* Inflow / Outflow Breakdown */}
                <div className="space-y-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                  {/* Inflow */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      Toplam Giriş:
                    </span>
                    <span className="font-bold text-emerald-400">+{formatCurrency(p.inflow.total)}</span>
                  </div>
                  <div className="pl-5 space-y-1 text-[10px] text-slate-500">
                    <div className="flex justify-between">
                      <span>• Fatura Tahsilatları:</span>
                      <span className="font-medium text-slate-400">{formatCurrency(p.inflow.invoices)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Çek / Senet Portföyü:</span>
                      <span className="font-medium text-slate-400">{formatCurrency(p.inflow.checks)}</span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-slate-800/60 my-1" />

                  {/* Outflow */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      Toplam Çıkış:
                    </span>
                    <span className="font-bold text-red-400">-{formatCurrency(p.outflow.total)}</span>
                  </div>
                  <div className="pl-5 space-y-1 text-[10px] text-slate-500">
                    <div className="flex justify-between">
                      <span>• Fatura Ödemeleri:</span>
                      <span className="font-medium text-slate-400">{formatCurrency(p.outflow.invoices)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Net Flow Indicator */}
              <div className="mt-5 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Net Nakit Akışı
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border',
                    isPositive
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-red-400 bg-red-500/10 border-red-500/20'
                  )}
                >
                  {isPositive ? '+' : ''}
                  {formatCurrency(p.netFlow)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
