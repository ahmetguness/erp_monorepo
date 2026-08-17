'use client';

import { useState } from 'react';
import {
  ShieldAlert,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Play,
  Loader2,
  RefreshCcw,
  Sparkles,
  ShieldCheck,
  Building2,
  FileCheck,
} from 'lucide-react';
import { useResolveExceptionItem, useRunIntegrityScan } from '@/hooks/useIntegrityAutomation';
import type { IntegrityScanResult } from '@/services/integrity.automation.service';
import { cn } from '@/lib/utils';

export function IntegrityHubCenter() {
  const [scanResult, setScanResult] = useState<IntegrityScanResult | null>(null);

  const scanMutation = useRunIntegrityScan();
  const resolveMutation = useResolveExceptionItem();

  const handleStartScan = async () => {
    const res = await scanMutation.mutateAsync(true);
    setScanResult(res);
  };

  const handleResolveItem = async (id: string) => {
    await resolveMutation.mutateAsync({ id, notes: 'Kullanıcı tarafından manuel incelendi ve çözümlendi.' });
    if (scanResult) {
      setScanResult({
        ...scanResult,
        anomalies: scanResult.anomalies.filter((a) => a.id !== id),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-950/60 via-slate-900 to-slate-950 p-6 border border-teal-900/40 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-teal-400 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-teal-400" />
              <span>Veri Bütünlüğü & Self-Healing Otomasyonu</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Veri Bütünlüğü & Otomatik İyileştirme Merkezi
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Stok seviyeleri, muhasebe yevmiye dengesi, fatura ödeme tahsisleri ve rezervasyon kilitleri otomatik taranır. Güvenli hatalar kendi kendini iyileştirir (Self-Healing); kritik uyumsuzluklar İstisna Merkezine aktarılır.
            </p>
          </div>

          <button
            onClick={handleStartScan}
            disabled={scanMutation.isPending}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black text-xs transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
          >
            {scanMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Wrench className="w-4 h-4" />
                <span>Sistem Bütünlüğünü Tara & Self-Healing Çalıştır</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metrics Banner if Scan Completed */}
      {scanResult && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Taranan Kurallar</span>
            <div className="text-2xl font-black text-white">{scanResult.totalRulesChecked} Kontrol</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Tespit Edilen Uyumsuzluk</span>
            <div className="text-2xl font-black text-amber-400">{scanResult.totalAnomaliesFound} Adet</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Otomatik Düzeltilen (Self-Healing)</span>
            <div className="text-2xl font-black text-emerald-400">{scanResult.autoFixedCount} Düzeltme</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">İstisna Merkezinde Bekleyen</span>
            <div className="text-2xl font-black text-rose-400">{scanResult.exceptionCenterCount} İnceleme</div>
          </div>
        </div>
      )}

      {/* Exception Center Table / Action Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>İstisna Merkezi (Exception Center)</span>
          </div>
          <span className="text-[10px] text-amber-400 font-semibold uppercase">Manuel İnceleme & Tek Tıkla Çözüm</span>
        </div>

        {scanResult && scanResult.anomalies.length > 0 ? (
          <div className="space-y-3">
            {scanResult.anomalies.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'p-4 rounded-xl border text-xs space-y-2 transition-all',
                  item.actionTaken === 'AUTO_FIXED'
                    ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
                    : 'bg-slate-950/80 border-slate-800 text-slate-200',
                )}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-2 text-white">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                    <span>{item.title}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-black',
                        item.severity === 'CRITICAL'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300',
                      )}
                    >
                      {item.severity}
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border',
                        item.actionTaken === 'AUTO_FIXED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                      )}
                    >
                      {item.actionTaken === 'AUTO_FIXED' ? 'Otomatik İyileştirildi' : 'İstisna Merkezi'}
                    </span>
                  </div>
                </div>

                <p className="text-slate-300 leading-relaxed text-[11px]">{item.description}</p>

                {item.actionTaken === 'SENT_TO_EXCEPTION_CENTER' && (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleResolveItem(item.id)}
                      disabled={resolveMutation.isPending}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
                    >
                      {resolveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>İstisnai Manuel Çözümle</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800 text-slate-400 text-xs space-y-2">
            <p>Sistem bütünlük taraması başlatılmadı veya hiç uyumsuzluk tespit edilmedi.</p>
            <p className="text-[11px] text-slate-500">Yukarıdaki <strong className="text-teal-400">"Sistem Bütünlüğünü Tara"</strong> butonuna tıklayarak tarama yapabilirsiniz.</p>
          </div>
        )}
      </div>
    </div>
  );
}
