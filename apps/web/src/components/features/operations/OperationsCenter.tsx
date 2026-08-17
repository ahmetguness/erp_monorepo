'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Search,
  Server,
  Zap,
  ShoppingBag,
  AlertOctagon,
  ArrowRight,
  UserCheck,
  Building2,
  RefreshCw,
  Loader2,
  Layers,
} from 'lucide-react';
import { useEntityTimeline, useOperationsHealth } from '@/hooks/useOperations';
import { IntegrityHubCenter } from '@/components/features/integrity/IntegrityHubCenter';
import { cn, formatDateTime } from '@/lib/utils';

export function OperationsCenter() {
  const [searchEntityType, setSearchEntityType] = useState('SALES_ORDER');
  const [searchEntityCode, setSearchEntityCode] = useState('SO-000154');
  const [activeSearch, setActiveSearch] = useState({ type: 'SALES_ORDER', code: 'SO-000154' });

  const { data: health, isLoading: isHealthLoading, refetch: refetchHealth } = useOperationsHealth();
  const { data: timeline, isLoading: isTimelineLoading } = useEntityTimeline(
    activeSearch.type,
    activeSearch.code,
    Boolean(activeSearch.code),
  );

  const handleSearch = () => {
    if (!searchEntityCode.trim()) return;
    setActiveSearch({ type: searchEntityType, code: searchEntityCode.trim() });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 p-6 border border-slate-800 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>Operasyon İzlenebilirliği & Varlık Zaman Çizelgesi</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
              Operations & Observability Center
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mt-1">
              Otomasyon sağlığı, pazaryeri senkronizasyonu, E-Belge hataları ve muhasebe kayıtlarının canlı izlenmesi ile tüm ERP nesnelerinin yaşam döngüsü çizelgesi.
            </p>
          </div>

          <button
            onClick={() => refetchHealth()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center gap-2 border border-slate-700 shrink-0"
          >
            <RefreshCw className={cn('w-4 h-4', isHealthLoading && 'animate-spin')} />
            <span>Canlı Yenile</span>
          </button>
        </div>
      </div>

      {/* 8 Metric Health Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Automation Health */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Automation Health</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">%{health?.automationHealth.successRatePct ?? 100}</span>
            <span className="text-xs text-emerald-400 font-semibold">{health?.automationHealth.succeededCount ?? 0} Başarılı</span>
          </div>
          <p className="text-[11px] text-slate-500">Toplam {health?.automationHealth.totalExecutions ?? 0} otomasyon tetiklendi.</p>
        </div>

        {/* Card 2: Domain Events */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Domain Events</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{health?.domainEvents.totalEvents ?? 0}</span>
            <span className="text-xs text-rose-400 font-semibold">{health?.domainEvents.failedCount ?? 0} Hata</span>
          </div>
          <p className="text-[11px] text-slate-500">Canlı etki alanı olay günlükleri.</p>
        </div>

        {/* Card 3: Failed Jobs & Dead Letters */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Dead Letters & Failed Jobs</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{health?.deadLetters.count ?? 0}</span>
            <span className="text-xs text-amber-400 font-semibold">{health?.failedJobs.totalFailed ?? 0} İş Takıldı</span>
          </div>
          <p className="text-[11px] text-slate-500">Arka plan kuyruk takılmaları.</p>
        </div>

        {/* Card 4: API Failures */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">API Failures</span>
            <Server className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{health?.apiFailures.recentErrorCount ?? 0}</span>
            <span className="text-xs text-slate-400">Son 24 Saat</span>
          </div>
          <p className="text-[11px] text-slate-500">API uç nokta istisnaları.</p>
        </div>

        {/* Card 5: Marketplace Sync Errors */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Marketplace Sync Errors</span>
            <ShoppingBag className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{health?.marketplaceSyncErrors.failedCount ?? 0}</span>
            <span className="text-xs text-teal-400">Pazaryeri Hataları</span>
          </div>
          <p className="text-[11px] text-slate-500">Trendyol / HepsiBurada senkronizasyonu.</p>
        </div>

        {/* Card 6: EDocument Errors */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">EDocument Errors</span>
            <FileText className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{health?.eDocumentErrors.errorCount ?? 0}</span>
            <span className="text-xs text-indigo-400">E-Belge Uyarısı</span>
          </div>
          <p className="text-[11px] text-slate-500">E-Fatura / E-Arşiv hataları.</p>
        </div>

        {/* Card 7: Accounting Posting Errors */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 col-span-1 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Accounting Posting Errors</span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{health?.accountingPostingErrors.unpostedInvoiceCount ?? 0}</span>
            <span className="text-xs text-emerald-400">Bekleyen Fiş Kaydı</span>
          </div>
          <p className="text-[11px] text-slate-500">Otomatik yansıtma / Yevmiye fiş denetimi.</p>
        </div>
      </div>

      {/* Entity Timeline Viewer Component */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              <span>Varlık Yaşam Döngüsü Zaman Çizelgesi (Entity Timeline)</span>
            </h3>
            <p className="text-xs text-slate-400">Herhangi bir sipariş, fatura veya iş emrinin tüm tarihsel olay akışını inceleyin.</p>
          </div>

          {/* Search Inputs */}
          <div className="flex items-center gap-2">
            <select
              value={searchEntityType}
              onChange={(e) => setSearchEntityType(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-medium focus:outline-none"
            >
              <option value="SALES_ORDER">Satış Siparişi (SO)</option>
              <option value="INVOICE">Fatura (INV)</option>
            </select>

            <div className="relative">
              <input
                type="text"
                placeholder="Örn: SO-000154 veya INV-2026-001"
                value={searchEntityCode}
                onChange={(e) => setSearchEntityCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-48 sm:w-64 pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <button
              onClick={handleSearch}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shrink-0"
            >
              Sorgula
            </button>
          </div>
        </div>

        {/* Timeline Event Feed */}
        {isTimelineLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            <span>Zaman çizelgesi yükleniyor...</span>
          </div>
        ) : timeline && timeline.events.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{timeline.entityCode}</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-extrabold uppercase text-[10px]">
                  {timeline.status}
                </span>
              </div>
              <span className="text-slate-400 text-[11px]">Oluşturulma: {formatDateTime(timeline.createdAt)}</span>
            </div>

            {/* Vertical Timeline Stepper */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {timeline.events.map((event, idx) => (
                <div key={event.id || idx} className="relative flex items-start gap-4">
                  {/* Step Dot */}
                  <div
                    className={cn(
                      'absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-slate-950 text-[10px] font-bold',
                      event.type === 'SUCCESS'
                        ? 'border-emerald-500 text-emerald-400'
                        : event.type === 'WARNING'
                        ? 'border-amber-500 text-amber-400'
                        : event.type === 'ERROR'
                        ? 'border-rose-500 text-rose-400'
                        : 'border-indigo-500 text-indigo-400',
                    )}
                  >
                    ✓
                  </div>

                  <div className="flex-1 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{event.title}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{formatDateTime(event.timestamp)}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{event.description}</p>
                    <div className="pt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <UserCheck className="w-3 h-3 text-indigo-400" />
                      <span>Aktör / Sistem: {event.actor}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800 text-slate-400 text-xs">
            Arama kriterine uygun varlık kaydı veya tarihsel olay bulunamadı. Örn: <code className="text-indigo-300 font-bold">SO-000154</code> aratmayı deneyin.
          </div>
        )}
      </div>

      {/* Self-Healing & Exception Center */}
      <IntegrityHubCenter />
    </div>
  );
}
