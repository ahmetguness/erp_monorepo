'use client';

import { useState } from 'react';
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Sparkles,
  Link,
  Copy,
  CheckCircle2,
  Calendar,
  Percent,
  CreditCard,
  Building,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  useCashFlowForecast,
  useExecuteFinancialAction,
  useGenerateCollectionSettlement,
  useLiquidityRecommendations,
} from '@/hooks/useFinancialAutonomy';
import type { CollectionSettlementDraft } from '@/services/financial.autonomy.service';
import { cn, formatCurrency } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';

export function FinancialAutonomyCenter() {
  const [selectedDays, setSelectedDays] = useState<30 | 60 | 90>(30);
  const [sampleInvoiceId, setSampleInvoiceId] = useState('');
  const [settlementDraft, setSettlementDraft] = useState<CollectionSettlementDraft | null>(null);

  const forecastQuery = useCashFlowForecast(selectedDays);
  const recommendationsQuery = useLiquidityRecommendations();
  const settlementMutation = useGenerateCollectionSettlement();
  const executeMutation = useExecuteFinancialAction();
  const { toast } = useUIStore();

  const handleGenerateSettlement = async () => {
    if (!sampleInvoiceId.trim()) {
      toast.error('Lütfen bir Fatura ID girin.');
      return;
    }
    const res = await settlementMutation.mutateAsync(sampleInvoiceId.trim());
    setSettlementDraft(res);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Dinamik Ödeme Bağlantısı Kopyalandı!');
  };

  const handleExecuteAction = async (actionType: string, payload?: Record<string, unknown>) => {
    await executeMutation.mutateAsync({ actionType, payload });
  };

  const forecast = forecastQuery.data;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-950 p-6 border border-emerald-900/40 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <Banknote className="w-4 h-4 text-emerald-400" />
              <span>Proaktif Finansal Otonomi & Likidite Koruması</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Proactive Financial Autonomy & Liquidity Studio
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              30/60/90 günlük nakit projeksiyon simülasyonu, nakit açığı riski erken uyarısı, AI cari ödeme hızı analizi, dinamik erken ödeme iskontoları ve otonom likidite koruma aksiyonları.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shrink-0">
            {([30, 60, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDays(d)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  selectedDays === d
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800',
                )}
              >
                {d} Gün Projeksiyon
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      {forecastQuery.isLoading ? (
        <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Nakit Akışı Projeksiyonu Hesaplanıyor...</span>
        </div>
      ) : forecast ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Mevcut Toplam Kasa/Banka</span>
            <div className="text-xl sm:text-2xl font-black text-white">{formatCurrency(forecast.initialBalance, 'TRY')}</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Beklenen Toplam Giriş</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              <span>{formatCurrency(forecast.totalExpectedInflow, 'TRY')}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Beklenen Toplam Çıkış</span>
            <div className="text-xl sm:text-2xl font-black text-rose-400 flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              <span>{formatCurrency(forecast.totalExpectedOutflow, 'TRY')}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Tahmini Dönem Sonu Bakiye</span>
            <div
              className={cn(
                'text-xl sm:text-2xl font-black',
                forecast.projectedEndBalance >= 0 ? 'text-teal-400' : 'text-rose-500',
              )}
            >
              {formatCurrency(forecast.projectedEndBalance, 'TRY')}
            </div>
          </div>
        </div>
      ) : null}

      {/* Proactive Liquidity Recommendations */}
      {recommendationsQuery.data && recommendationsQuery.data.length > 0 && (
        <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-900/40 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Otonom Likidite Koruma & Erken Ödeme İskontosu Önerileri</span>
          </div>

          <div className="space-y-2">
            {recommendationsQuery.data.map((rec) => (
              <div
                key={rec.id}
                className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{rec.title}</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">{rec.description}</p>
                </div>

                <button
                  onClick={() => handleExecuteAction(rec.actionType, rec.payload)}
                  disabled={executeMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all shadow-md shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {executeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Otonom İskonto Tekliflerini İcra Et</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Autonomous Collection & Settlement Generator Studio */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Percent className="w-4 h-4 text-emerald-400" />
            <span>Dinamik Tahsilat & Erken Ödeme İskontosu Stüdyosu (Autonomous Collection Settlement)</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-semibold uppercase">AI Payment Velocity Driven</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Örn: clxxxx... Fatura ID girin"
            value={sampleInvoiceId}
            onChange={(e) => setSampleInvoiceId(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleGenerateSettlement}
            disabled={settlementMutation.isPending}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center gap-2 disabled:opacity-50 shrink-0"
          >
            {settlementMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span>Dinamik İskonto & Ödeme Linki Üret</span>
          </button>
        </div>

        {settlementDraft && (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-900/40 text-xs space-y-3">
            <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-2">
              <span className="text-white">Fatura #{settlementDraft.invoiceNumber} — {settlementDraft.contactName}</span>
              <span className="text-emerald-400 font-black">
                % {settlementDraft.suggestedDiscountPercent} Erken Ödeme İskontosu Teklifi
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
              <div>
                <span className="text-slate-400">Orijinal Tutar:</span>
                <div className="font-bold text-white">{formatCurrency(settlementDraft.totalAmount, 'TRY')}</div>
              </div>
              <div>
                <span className="text-slate-400">Uygulanan İskonto:</span>
                <div className="font-bold text-amber-400">-{formatCurrency(settlementDraft.discountAmount, 'TRY')}</div>
              </div>
              <div>
                <span className="text-slate-400">İndirimli Net Tahsilat:</span>
                <div className="font-black text-emerald-400">{formatCurrency(settlementDraft.netPayableAmount, 'TRY')}</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate text-slate-300">
                <Link className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate font-mono text-[11px]">{settlementDraft.paymentLinkUrl}</span>
              </div>
              <button
                onClick={() => handleCopyLink(settlementDraft.paymentLinkUrl)}
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 shrink-0"
              >
                <Copy className="w-3 h-3" />
                <span>Kopyala</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
