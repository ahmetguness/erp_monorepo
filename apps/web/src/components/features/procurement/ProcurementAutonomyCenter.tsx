'use client';

import {
  Bot,
  Truck,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Loader2,
  PackageCheck,
  Building2,
  Calendar,
  CheckCircle2,
  RefreshCcw,
  Boxes,
} from 'lucide-react';
import {
  useDispatchZeroTouchPo,
  useProcurementProjections,
  useRunProcurementBatchScan,
  useSupplierReliabilityScores,
} from '@/hooks/useProcurementAutonomy';
import { cn, formatCurrency } from '@/lib/utils';

export function ProcurementAutonomyCenter() {
  const projectionsQuery = useProcurementProjections();
  const suppliersQuery = useSupplierReliabilityScores();
  const dispatchMutation = useDispatchZeroTouchPo();
  const batchScanMutation = useRunProcurementBatchScan();

  const handleRunBatchScan = async () => {
    await batchScanMutation.mutateAsync(true);
  };

  const handleSingleDispatch = async (productId: string) => {
    await dispatchMutation.mutateAsync({ productId, autoDispatch: true });
  };

  const projections = projectionsQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  const criticalItems = projections.filter((p) => p.reorderStatus !== 'OK');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 p-6 border border-blue-900/40 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
              <Bot className="w-4 h-4 text-blue-400" />
              <span>Otonom Satın Alma & Tedarik Zinciri Stüdyosu</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Autonomous Procurement & Supply Chain Studio
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Stok projeksiyonu (`OnHand - Reserved + Incoming`), günlük tüketim hızı, tedarikçi güvenilirlik skoru ve bütçe limitleri dahilinde **Sıfır Dokunuşlu Satın Alma (Zero-Touch PO Dispatch)**.
            </p>
          </div>

          <button
            onClick={handleRunBatchScan}
            disabled={batchScanMutation.isPending}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
          >
            {batchScanMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Otonom Satın Alma Taraması Çalıştır</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Supplier Reliability Index Scoreboard */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Truck className="w-4 h-4 text-blue-400" />
            <span>Tedarikçi Güvenilirlik Skor Kartları (Supplier Reliability Index)</span>
          </div>
          <span className="text-[10px] text-blue-400 font-semibold uppercase">Performance & Risk Rated</span>
        </div>

        {suppliersQuery.isLoading ? (
          <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Tedarikçi Skorları Hesaplanıyor...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {suppliers.map((sup) => (
              <div key={sup.supplierId} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-white flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>{sup.supplierName}</span>
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-black',
                      sup.riskCategory === 'LOW'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                    )}
                  >
                    Skor: {sup.reliabilityScore}/100
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                  <div>
                    <span>Zamanında Teslimat:</span>
                    <div className="font-bold text-white">%{sup.onTimeDeliveryRatePct}</div>
                  </div>
                  <div>
                    <span>Fiyat İstikrarı:</span>
                    <div className="font-bold text-white">{sup.priceStabilityScore}/100</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stock Projections & Zero-Touch Dispatch Table */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Boxes className="w-4 h-4 text-indigo-400" />
            <span>Stok Projeksiyonu & Otonom Satın Alma Listesi</span>
          </div>
          <span className="text-[10px] text-amber-400 font-semibold uppercase">
            {criticalItems.length} Ürün İhtiyaç Sınırında
          </span>
        </div>

        {projectionsQuery.isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Stok Projeksiyonları Analiz Ediliyor...</span>
          </div>
        ) : projections.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Ürün / SKU</th>
                  <th className="p-3">Eldeki Stok</th>
                  <th className="p-3">Rezerve Stok</th>
                  <th className="p-3">Projeksiyon Stok</th>
                  <th className="p-3">Stok Ömrü (Gün)</th>
                  <th className="p-3">Durum</th>
                  <th className="p-3 text-right">Otonom Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {projections.map((item) => (
                  <tr key={item.productId} className="hover:bg-slate-850/50 transition-colors">
                    <td className="p-3 font-bold text-white">
                      <div>{item.productName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.productSku}</div>
                    </td>
                    <td className="p-3">{item.onHandQty} adet</td>
                    <td className="p-3 text-amber-400">{item.reservedQty} adet</td>
                    <td className="p-3 font-bold text-white">{item.projectedStock} adet</td>
                    <td className="p-3">
                      <span className="font-bold text-indigo-300">{item.daysOfSupply} Gün</span>
                      <span className="text-[10px] text-slate-500 block">({item.dailyBurnRate} adet/gün)</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-black uppercase',
                          item.reorderStatus === 'OK'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : item.reorderStatus === 'CRITICAL_REORDER'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300',
                        )}
                      >
                        {item.reorderStatus === 'OK'
                          ? 'Yeterli'
                          : item.reorderStatus === 'CRITICAL_REORDER'
                          ? 'Kritik Stok'
                          : 'Sipariş Gerekli'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {item.reorderStatus !== 'OK' && (
                        <button
                          onClick={() => handleSingleDispatch(item.productId)}
                          disabled={dispatchMutation.isPending}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition-all inline-flex items-center gap-1 shadow-md disabled:opacity-50"
                        >
                          {dispatchMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          <span>Zero-Touch PO Gönder</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">Stok kaydı bulunamadı.</div>
        )}
      </div>
    </div>
  );
}
