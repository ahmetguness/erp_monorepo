'use client';

import {
  Store,
  DollarSign,
  TrendingUp,
  Percent,
  Zap,
  Loader2,
  Boxes,
  ArrowRightLeft,
  ShieldAlert,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import {
  useExecuteReprice,
  useReallocateStock,
  useRepricingAnalysis,
  useRunBatchRepricingScan,
  useStockAllocations,
} from '@/hooks/useMarketplacePricing';
import { cn, formatCurrency } from '@/lib/utils';

export function MarketplacePricingCenter() {
  const analysisQuery = useRepricingAnalysis();
  const allocationsQuery = useStockAllocations();
  const repriceMutation = useExecuteReprice();
  const reallocateMutation = useReallocateStock();
  const batchScanMutation = useRunBatchRepricingScan();

  const handleRunBatchScan = async () => {
    await batchScanMutation.mutateAsync(true);
  };

  const handleSingleReprice = async (listingId: string, targetPrice?: number) => {
    await repriceMutation.mutateAsync({ listingId, targetPrice });
  };

  const handleSingleReallocate = async (productId: string) => {
    await reallocateMutation.mutateAsync(productId);
  };

  const analysisItems = analysisQuery.data ?? [];
  const allocationItems = allocationsQuery.data ?? [];

  const marginRisks = analysisItems.filter((a) => a.status === 'MARGIN_RISK').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-950/70 via-slate-900 to-slate-950 p-6 border border-orange-900/40 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider">
              <Store className="w-4 h-4 text-orange-400" />
              <span>Akıllı Pazaryeri & Dinamik Fiyatlandırma Ajanı</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Dynamic Marketplace Pricing & Stock Buffer Engine
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Ürün ortalama maliyeti (`averageCost`) ve hedef kâr marjı koruma politikası (%20 minimum marj guard) ile canlı fiyat repricing ve kanallar arası stok kotası dengeleme.
            </p>
          </div>

          <button
            onClick={handleRunBatchScan}
            disabled={batchScanMutation.isPending}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
          >
            {batchScanMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Otonom Repricing & Marj Koruma Taraması</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Repricing Analysis Table */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <DollarSign className="w-4 h-4 text-orange-400" />
            <span>Dinamik Fiyatlandırma & Marj Analiz Tablosu (Dynamic Repricing Engine)</span>
          </div>
          <span className="text-[10px] text-amber-400 font-semibold uppercase">
            {marginRisks > 0 ? `${marginRisks} İlanda Marj Riski Tespit Edildi` : 'Tüm Marjlar Hedef Sınırda'}
          </span>
        </div>

        {analysisQuery.isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            <span>Pazaryeri İlan Fiyatları Analiz Ediliyor...</span>
          </div>
        ) : analysisItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Kanal / İlan</th>
                  <th className="p-3">Ürün / SKU</th>
                  <th className="p-3">Mevcut Fiyat</th>
                  <th className="p-3">Ort. Maliyet</th>
                  <th className="p-3">Kâr Marjı %</th>
                  <th className="p-3">Önerilen Fiyat</th>
                  <th className="p-3 text-right">Otonom Reprice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {analysisItems.map((item) => (
                  <tr key={item.listingId} className="hover:bg-slate-850/50 transition-colors">
                    <td className="p-3 font-bold text-white">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-800 text-orange-400 border border-slate-700">
                        {item.channel}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1">{item.integrationName}</div>
                    </td>
                    <td className="p-3 font-bold text-white">
                      <div>{item.productName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.externalSku}</div>
                    </td>
                    <td className="p-3 font-bold text-white">{formatCurrency(item.currentPrice, 'TRY')}</td>
                    <td className="p-3 text-slate-400">{formatCurrency(item.averageCost, 'TRY')}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-black',
                          item.currentMarginPct < 15
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-emerald-500/10 text-emerald-400',
                        )}
                      >
                        %{item.currentMarginPct}
                      </span>
                    </td>
                    <td className="p-3 font-black text-amber-400">{formatCurrency(item.recommendedPrice, 'TRY')}</td>
                    <td className="p-3 text-right">
                      {item.status !== 'OPTIMAL' && (
                        <button
                          onClick={() => handleSingleReprice(item.listingId, item.recommendedPrice)}
                          disabled={repriceMutation.isPending}
                          className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-[10px] transition-all inline-flex items-center gap-1 shadow-md disabled:opacity-50"
                        >
                          {repriceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />}
                          <span>Fiyatı Güncelle</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">Pazaryeri ilanı bulunamadı.</div>
        )}
      </div>

      {/* Inter-Channel Stock Allocation Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <ArrowRightLeft className="w-4 h-4 text-orange-400" />
            <span>Kanallar Arası Stok Tamponu Dengeleme (Inter-Channel Stock Reallocation)</span>
          </div>
          <span className="text-[10px] text-orange-400 font-semibold uppercase">Sales Velocity Driven</span>
        </div>

        {allocationsQuery.isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            <span>Stok Kotaları ve Satış Hızları Analiz Ediliyor...</span>
          </div>
        ) : allocationItems.length > 0 ? (
          <div className="space-y-3">
            {allocationItems.map((item) => (
              <div key={item.productId} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-white flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-orange-400" />
                    <span>{item.productName}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">Toplam Eldeki Stok: <strong className="text-white">{item.totalOnHandStock} Adet</strong></span>
                    <button
                      onClick={() => handleSingleReallocate(item.productId)}
                      disabled={reallocateMutation.isPending}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 font-bold text-[10px] transition-all flex items-center gap-1 border border-slate-700 disabled:opacity-50"
                    >
                      {reallocateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightLeft className="w-3 h-3" />}
                      <span>Kotaları Dengele</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-900">
                  {item.channelAllocations.map((ca) => (
                    <div key={ca.integrationId} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                      <div className="font-bold text-white justify-between flex">
                        <span>{ca.channelName}</span>
                        <span className="text-orange-400">Hız: {ca.salesVelocity30Days}/ay</span>
                      </div>
                      <div className="text-slate-400 flex justify-between">
                        <span>Mevcut Kota: <strong className="text-white">{ca.currentAllocatedStock}</strong></span>
                        <span>Önerilen: <strong className="text-emerald-400">{ca.recommendedStockQuota}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">Kanallar arası stok tahsisi verisi yok.</div>
        )}
      </div>
    </div>
  );
}
