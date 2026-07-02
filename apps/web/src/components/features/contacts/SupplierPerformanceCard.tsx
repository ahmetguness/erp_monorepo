'use client';

import { Activity, Clock, TrendingUp, AlertTriangle, CheckCircle, Shield, Award } from 'lucide-react';
import { useSupplierPerformance } from '@/hooks/useContacts';
import { cn, formatCurrency } from '@/lib/utils';

interface SupplierPerformanceCardProps {
  contactId: string;
}

export function SupplierPerformanceCard({ contactId }: SupplierPerformanceCardProps) {
  const { data, isLoading, error } = useSupplierPerformance(contactId);

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse space-y-3">
        <div className="h-4 bg-slate-800 rounded w-1/3" />
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-slate-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-slate-800 rounded w-3/4" />
            <div className="h-3 bg-slate-800 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Return empty if error or no data
  }

  const score = data.score;

  // Determine color theme based on score
  const getScoreColorClass = (val: number) => {
    if (val >= 85) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (val >= 60) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-red-400 border-red-500/30 bg-red-500/10';
  };

  const getScoreTextClass = (val: number) => {
    if (val >= 85) return 'text-emerald-400';
    if (val >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreLabel = (val: number) => {
    if (val >= 85) return 'Mükemmel';
    if (val >= 60) return 'Güvenilir';
    return 'Riskli';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 relative overflow-hidden group">
      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-sky-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-violet-400" />
            Tedarikçi Performansı
          </h3>
          <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider', getScoreColorClass(score))}>
            {getScoreLabel(score)}
          </span>
        </div>

        {/* Score Ring / Summary */}
        <div className="flex items-center gap-4 bg-slate-950/30 border border-slate-800/40 p-3 rounded-xl">
          <div className="relative flex items-center justify-center shrink-0">
            {/* Inner score */}
            <div className="w-14 h-14 rounded-full border-2 border-slate-800 flex flex-col items-center justify-center bg-slate-950">
              <span className={cn('text-lg font-black tracking-tight leading-none', getScoreTextClass(score))}>
                {data.totalOrders === 0 ? '—' : score}
              </span>
              <span className="text-[7px] text-slate-500 font-bold uppercase mt-0.5">SKOR</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 leading-relaxed">
              {data.totalOrders === 0 
                ? 'Bu tedarikçiyle henüz tamamlanmış satın alma siparişi bulunmuyor.'
                : `Toplam ${data.totalOrders} sipariş ve teslimat verisi üzerinden hesaplanmıştır.`
              }
            </p>
          </div>
        </div>

        {/* Breakdown Metrics */}
        {data.totalOrders > 0 && (
          <div className="space-y-2.5 pt-1">
            {/* Lead Time */}
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2 min-w-0">
                <div className="p-1 rounded bg-slate-800 text-slate-400 mt-0.5 shrink-0"><Clock className="w-3.5 h-3.5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-300">Teslim Süresi</p>
                  <p className="text-[10px] text-slate-500 truncate">Ortalama sipariş karşılama hızı.</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-white">{data.leadTimeDays} gün</p>
                <p className="text-[10px] text-slate-400 font-medium">Puan: {data.leadTimeScore}/100</p>
              </div>
            </div>

            {/* Price Deviation */}
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2 min-w-0">
                <div className="p-1 rounded bg-slate-800 text-slate-400 mt-0.5 shrink-0"><TrendingUp className="w-3.5 h-3.5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-300">Fiyat Sapması</p>
                  <p className="text-[10px] text-slate-500 truncate">Standart alış fiyatından farkı.</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={cn('font-bold', data.priceDeviationPct <= 0 ? 'text-emerald-400' : 'text-amber-400')}>
                  {data.priceDeviationPct > 0 ? `+${data.priceDeviationPct}` : data.priceDeviationPct}%
                </p>
                <p className="text-[10px] text-slate-400 font-medium">Puan: {data.priceDeviationScore}/100</p>
              </div>
            </div>

            {/* Return Rate */}
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2 min-w-0">
                <div className="p-1 rounded bg-slate-800 text-slate-400 mt-0.5 shrink-0"><AlertTriangle className="w-3.5 h-3.5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-300">İade Oranı</p>
                  <p className="text-[10px] text-slate-500 truncate">Hatalı/iade edilen teslimat oranı.</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-white">%{data.returnRatePct}</p>
                <p className="text-[10px] text-slate-400 font-medium">Puan: {data.returnRateScore}/100</p>
              </div>
            </div>

            {/* Open Orders */}
            <div className="flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2 min-w-0">
                <div className="p-1 rounded bg-slate-800 text-slate-400 mt-0.5 shrink-0"><CheckCircle className="w-3.5 h-3.5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-300">Sipariş Performansı</p>
                  <p className="text-[10px] text-slate-500 truncate">Açık ve gecikmiş siparişler.</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-white">
                  {data.openOrderCount} açık {data.overdueOrderCount > 0 && <span className="text-red-400">({data.overdueOrderCount} gecikmiş)</span>}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">Puan: {data.openOrderScore}/100</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
