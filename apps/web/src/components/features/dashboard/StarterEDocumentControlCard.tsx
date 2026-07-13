'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileCheck, Hourglass, WalletCards } from 'lucide-react';
import { useEDocumentSummary } from '@/hooks/useEDocuments';
import { cn } from '@/lib/utils';
import type { EDocumentSummary, EDocumentStatus } from '@/services/e-document.service';

interface StarterEDocumentControlCardProps {
  enabled?: boolean;
}

const STATUS_LABEL: Record<EDocumentStatus, string> = {
  PENDING: 'Bekliyor',
  PROCESSING: 'Isleniyor',
  SENT: 'Gonderildi',
  ACCEPTED: 'Kabul',
  REJECTED: 'Red',
  CANCELLED: 'Iptal',
  ERROR: 'Hata',
};

function creditLabel(summary: EDocumentSummary | undefined): string {
  if (!summary || summary.creditStatus === 'not_configured') return 'Kontor tanimsiz';
  return `${summary.creditBalance ?? 0} kontor`;
}

function statusTone(summary: EDocumentSummary | undefined): { label: string; className: string } {
  if (!summary) return { label: 'Yükleniyor', className: 'border-slate-700 bg-slate-800 text-slate-300' };
  if (summary.sendingErrors > 0) return { label: 'Mudahale gerekli', className: 'border-red-500/30 bg-red-500/10 text-red-300' };
  if (summary.pending > 0) return { label: 'Bekleyen var', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' };
  return { label: 'Saglikli', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' };
}

export function StarterEDocumentControlCard({ enabled = true }: StarterEDocumentControlCardProps) {
  const { data, isLoading } = useEDocumentSummary({ enabled });

  if (!enabled) return null;

  const tone = statusTone(data);
  const statusCounts = data?.statusCounts ?? [];
  const hasDocuments = (data?.total ?? 0) > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-slate-800/80 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-2">
            <FileCheck className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Starter E-Belge Kontrol Paneli</h2>
            <p className="mt-0.5 text-xs text-slate-500">Kontor durumu, bekleyen belgeler ve gonderim hatalari</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-lg border px-3 py-1 text-xs font-bold', tone.className)}>
            {tone.label}
          </span>
          <Link href="/dashboard/e-documents" className="inline-flex h-8 items-center rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-200">
            Paneli Ac
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">E-belge durumu yukleniyor...</div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kontor</p>
                <WalletCards className="h-4 w-4 text-cyan-300" />
              </div>
              <p className="mt-3 truncate text-lg font-bold text-white">{creditLabel(data)}</p>
              <p className="mt-1 text-xs text-slate-500">Saglayici bakiyesi</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bekleyen</p>
                <Hourglass className="h-4 w-4 text-amber-300" />
              </div>
              <p className="mt-3 text-lg font-bold text-white">{data?.pending ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">PENDING + PROCESSING</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hata</p>
                <AlertTriangle className={cn('h-4 w-4', (data?.sendingErrors ?? 0) > 0 ? 'text-red-300' : 'text-slate-500')} />
              </div>
              <p className="mt-3 text-lg font-bold text-white">{data?.sendingErrors ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">ERROR + REJECTED</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Basarili</p>
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="mt-3 text-lg font-bold text-white">{data?.accepted ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Kabul edilen belge</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Son hata</p>
              {data?.latestError ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-300">
                      {STATUS_LABEL[data.latestError.status]}
                    </span>
                    <span className="text-xs text-slate-500">{data.latestError.retryCount} deneme</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-300">{data.latestError.providerMessage ?? 'Saglayici mesaji yok'}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Aktif gonderim hatasi yok</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Durum dagilimi</p>
                <span className="text-xs font-semibold text-slate-400">{data?.total ?? 0} belge</span>
              </div>
              {hasDocuments ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {statusCounts.map((item) => (
                    <div key={item.status} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                      <span className="text-xs text-slate-400">{STATUS_LABEL[item.status]}</span>
                      <span className="text-xs font-bold text-slate-100">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Henuz e-belge kaydi yok</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
