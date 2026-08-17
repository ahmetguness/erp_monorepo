'use client';

import {
  AlertTriangle,
  RotateCcw,
  FileX,
  ShieldAlert,
  Info,
  CheckCircle2,
  Clock,
  FileText,
  Building2,
  Sparkles,
} from 'lucide-react';
import { useEDocumentExceptions, useRetryEDocument } from '@/hooks/useEDocumentAutomation';
import { cn } from '@/lib/utils';

export function EDocumentExceptionCenter() {
  const { data: exceptions = [], isLoading, refetch } = useEDocumentExceptions();
  const retryMutation = useRetryEDocument();

  const rejectedCount = exceptions.filter((e) => e.status === 'REJECTED').length;
  const errorCount = exceptions.filter((e) => e.status === 'ERROR').length;

  return (
    <div className="space-y-6">
      {/* Information Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 p-6 border border-rose-900/40 shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>E-Belge İstisna & Hata Yönetim Merkezi</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              GİB & Entegratör Hata Boru Hattı
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
              GİB veya özel entegratör tarafından reddedilen ya da iletim hatası alan e-belgeler burada toplanır. Durumlar doğrudan entegratör callback yanıtlarıyla güncellenir.
            </p>
          </div>

          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700/80 flex items-center gap-2 shadow-sm self-start md:self-auto"
          >
            <RotateCcw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {/* Exception Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">GİB Reddedilen Belgeler</span>
            <FileX className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400">{rejectedCount}</div>
          <p className="text-[10px] text-slate-500 mt-1">GİB şema veya imza red alan belgeler</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">İletim Hataları</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400">{errorCount}</div>
          <p className="text-[10px] text-slate-500 mt-1">Entegratör bağlantı veya zaman aşımı hataları</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Toplam İstisna Kaydı</span>
            <Info className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black text-sky-400">{exceptions.length}</div>
          <p className="text-[10px] text-slate-500 mt-1">Müdahale bekleyen e-belge sayısı</p>
        </div>
      </div>

      {/* Exception Center Main List */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Hatalı ve Reddedilen E-Belgeler</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Sağlayıcı Callback Yetkisi</span>
        </div>

        <div className="space-y-3">
          {exceptions.map((doc) => (
            <div
              key={doc.id}
              className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-bold uppercase border',
                      doc.type === 'E_INVOICE' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                      doc.type === 'E_ARCHIVE' && 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                      doc.type === 'E_WAYBILL' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    )}
                  >
                    {doc.type}
                  </span>

                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border',
                      doc.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    )}
                  >
                    {doc.status}
                  </span>

                  {doc.invoice && (
                    <span className="text-xs font-bold text-white flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      Fatura: {doc.invoice.number}
                    </span>
                  )}

                  {doc.invoice?.contactName && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      {doc.invoice.contactName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Tekrar: {doc.retryCount}
                  </span>

                  <button
                    onClick={() => retryMutation.mutate(doc.id)}
                    disabled={retryMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
                  >
                    <RotateCcw className={cn('w-3.5 h-3.5', retryMutation.isPending && 'animate-spin')} />
                    <span>Yeniden Gönder</span>
                  </button>
                </div>
              </div>

              {/* Details & Error Message */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">GİB ETTN / Takip Kodu</div>
                  <div className="font-mono text-slate-300 text-[11px] truncate">{doc.uuid || doc.providerCode || 'ETTN Üretilmedi'}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/30 text-rose-300 space-y-1">
                  <div className="text-[10px] text-rose-400 font-semibold uppercase">Sağlayıcı / GİB Hata Mesajı</div>
                  <div className="text-[11px] leading-snug">{doc.providerMessage || 'Detaylı hata mesajı bulunmuyor.'}</div>
                </div>
              </div>
            </div>
          ))}

          {exceptions.length === 0 && !isLoading && (
            <div className="py-12 text-center text-slate-500 text-xs space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
              <p>Harika! İstisna merkezinde bekleyen reddedilmiş veya hatalı e-belge bulunmuyor.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
