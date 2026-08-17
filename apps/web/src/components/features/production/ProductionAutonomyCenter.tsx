'use client';

import {
  Factory,
  Cog,
  AlertTriangle,
  Zap,
  Loader2,
  Wrench,
  Gauge,
  Calendar,
  CheckCircle2,
  Activity,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import {
  usePredictiveMaintenance,
  useReserveMaintenanceParts,
  useRunScheduleOptimization,
  useWorkCenterCapacity,
} from '@/hooks/useProductionAutonomy';
import { cn } from '@/lib/utils';

export function ProductionAutonomyCenter() {
  const capacityQuery = useWorkCenterCapacity();
  const maintenanceQuery = usePredictiveMaintenance();
  const optimizeMutation = useRunScheduleOptimization();
  const reserveMutation = useReserveMaintenanceParts();

  const handleOptimizeSchedule = async () => {
    await optimizeMutation.mutateAsync(true);
  };

  const handleReserveSpare = async (workCenterId: string, productId: string, quantity: number) => {
    await reserveMutation.mutateAsync({ workCenterId, productId, quantity });
  };

  const capacityItems = capacityQuery.data ?? [];
  const maintenanceItems = maintenanceQuery.data ?? [];

  const bottleneckCount = capacityItems.filter((c) => c.status === 'BOTTLENECK').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950/70 via-slate-900 to-slate-950 p-6 border border-purple-900/40 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider">
              <Factory className="w-4 h-4 text-purple-400" />
              <span>Otonom Üretim & Kapasite Çizelgeleme Stüdyosu</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Autonomous Production & Capacity Scheduling Studio
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              İş merkezleri yük ve darboğaz (bottleneck) analizi, otonom vardiya & iş emri çizelgelemesi ve kestirimci bakım yedek parça stok kilitleme motoru.
            </p>
          </div>

          <button
            onClick={handleOptimizeSchedule}
            disabled={optimizeMutation.isPending}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
          >
            {optimizeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Otonom Çizelgelemeyi Başlat</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Capacity & Bottleneck Cards */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Gauge className="w-4 h-4 text-purple-400" />
            <span>İş Merkezleri Kapasite & Darboğaz Analizi (Workload Utilization)</span>
          </div>
          <span className="text-[10px] text-amber-400 font-semibold uppercase">
            {bottleneckCount > 0 ? `${bottleneckCount} İş Merkezinde Darboğaz Uyarısı` : 'Tüm Rotalar Stabil'}
          </span>
        </div>

        {capacityQuery.isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            <span>İş Merkezi Kapasiteleri Hesaplanıyor...</span>
          </div>
        ) : capacityItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {capacityItems.map((item) => (
              <div key={item.workCenterId} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-white flex items-center gap-2">
                    <Cog className="w-4 h-4 text-purple-400" />
                    <span>{item.workCenterName}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({item.code})</span>
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-black uppercase',
                      item.status === 'BOTTLENECK'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : item.status === 'HIGH_LOAD'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                    )}
                  >
                    {item.status === 'BOTTLENECK' ? 'DARBOĞAZ' : item.status === 'HIGH_LOAD' ? 'YÜKSEK YÜK' : 'NORMAL'}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                    <span>Kapasite Kullanım Oranı:</span>
                    <span className="text-white font-bold">%{item.utilizationPct}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500',
                        item.utilizationPct >= 85
                          ? 'bg-rose-500'
                          : item.utilizationPct >= 70
                          ? 'bg-amber-500'
                          : 'bg-purple-500',
                      )}
                      style={{ width: `${Math.min(100, item.utilizationPct)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-900">
                  <span>Aktif İş Emri: <strong className="text-white">{item.activeWorkOrdersCount} Adet</strong></span>
                  <span>Planlanan Yük: <strong className="text-white">{item.plannedWorkloadHours} Saat</strong></span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">İş merkezi kaydı bulunamadı.</div>
        )}
      </div>

      {/* Predictive Maintenance & Spare Parts Reservation Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Wrench className="w-4 h-4 text-purple-400" />
            <span>Kestirimci Bakım & Stok Kilitleme (Predictive Maintenance)</span>
          </div>
          <span className="text-[10px] text-purple-400 font-semibold uppercase">Risk Driven Auto-Reserve</span>
        </div>

        {maintenanceQuery.isLoading ? (
          <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            <span>Makine Sağlık Riskleri Analiz Ediliyor...</span>
          </div>
        ) : maintenanceItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {maintenanceItems.map((m) => (
              <div key={m.workCenterId} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-white">{m.workCenterName}</span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-black',
                      m.riskLevel === 'HIGH'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300',
                    )}
                  >
                    Risk: %{m.failureProbabilityPct}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 space-y-1">
                  <div>Çalışma Saati: <strong className="text-white">{m.operatingHours} Saat</strong></div>
                  {m.recommendedSpareParts.map((sp) => (
                    <div key={sp.productId} className="pt-2 flex items-center justify-between gap-2 border-t border-slate-900">
                      <span className="text-slate-300 truncate">{sp.productName} ({sp.requiredQty} Adet)</span>
                      <button
                        onClick={() => handleReserveSpare(m.workCenterId, sp.productId, sp.requiredQty)}
                        disabled={reserveMutation.isPending}
                        className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] transition-all shrink-0 flex items-center gap-1 shadow disabled:opacity-50"
                      >
                        {reserveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
                        <span>Stokta Kilitle</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">Kestirimci bakım uyarısı yok.</div>
        )}
      </div>
    </div>
  );
}
