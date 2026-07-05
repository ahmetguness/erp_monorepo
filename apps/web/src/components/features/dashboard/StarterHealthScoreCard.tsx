'use client';

import Link from 'next/link';
import { Activity, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useStarterHealthScore } from '@/hooks/useStarterHealth';
import { cn } from '@/lib/utils';

interface StarterHealthScoreCardProps {
  enabled?: boolean;
}

function getScoreTone(score: number): { text: string; bg: string; border: string; fill: string } {
  if (score >= 80) {
    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      fill: 'bg-emerald-500',
    };
  }
  if (score >= 50) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      fill: 'bg-amber-500',
    };
  }
  return {
    text: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    fill: 'bg-red-500',
  };
}

export function StarterHealthScoreCard({ enabled = true }: StarterHealthScoreCardProps) {
  const { data, isLoading } = useStarterHealthScore({ enabled });

  if (!enabled) return null;

  const score = data?.score ?? 100;
  const issues = data?.issues ?? [];
  const tone = getScoreTone(score);

  // Keep the visible checklist stable even when a check has no active issue.
  const allChecks = [
    {
      key: 'missing_invoice_prefix',
      label: 'Fatura Prefixi',
      defaultDescription: 'Otomatik fatura numarasi icin prefix ve seri ayari hazir.',
      href: '/dashboard/settings/general',
      actionLabel: 'Ayarlari Gor',
    },
    {
      key: 'missing_tax_rate',
      label: 'Ürün KDV Tanımları',
      defaultDescription: 'Tüm aktif ürünlerinizde KDV oranı tanımlanmış durumda.',
      href: '/dashboard/products',
      actionLabel: 'Ürünleri Gör',
    },
    {
      key: 'missing_contact_tax_number',
      label: 'Cari Vergi Bilgisi',
      defaultDescription: 'Aktif carilerde temel vergi bilgileri tamamlanmis durumda.',
      href: '/dashboard/contacts',
      actionLabel: 'Carileri Gor',
    },
    {
      key: 'missing_min_stock',
      label: 'Minimum Stok',
      defaultDescription: 'Aktif urunlerde minimum stok esikleri tanimli.',
      href: '/dashboard/products',
      actionLabel: 'Urunleri Gor',
    },
    {
      key: 'missing_cash_bank_account',
      label: 'Kasa/Banka Hesabi',
      defaultDescription: 'Aktif kasa veya banka hesabi tanimli.',
      href: '/dashboard/payments/cash-accounts',
      actionLabel: 'Hesaplari Gor',
    },
    {
      key: 'negative_stock',
      label: 'Stok Seviye Kontrolü',
      defaultDescription: 'Eksiye düşen veya riskli stok kaleminiz bulunmamaktadır.',
      href: '/dashboard/stock',
      actionLabel: 'Stokları Gör',
    },
    {
      key: 'overdue_invoice',
      label: 'Fatura Vade Takibi',
      defaultDescription: 'Vadesi geçmiş ve tahsilat bekleyen fatura bulunmamaktadır.',
      href: '/dashboard/invoices',
      actionLabel: 'Faturaları Gör',
    },
  ] as const;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/[0.03] overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2">
            <Activity className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Starter Sağlık Skoru</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Eksik vergi oranı, eksi stok riski ve vadesi geçen fatura kalite uyarıları
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn('rounded-lg border px-3 py-1 text-sm font-bold tracking-wider', tone.text, tone.bg, tone.border)}>
            Skor: {isLoading ? '...' : `${score}/100`}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500 animate-pulse">
          Sağlık skoru hesaplanıyor...
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Progress Bar with Glow */}
          <div className="relative">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={cn('h-full rounded-full transition-all duration-500 ease-out', tone.fill)}
                style={{ width: `${score}%` }}
              />
            </div>
            {/* Soft glowing line matching status */}
            <div
              className={cn('absolute -inset-0.5 h-3.5 blur opacity-25 rounded-full transition-all duration-500 ease-out', tone.fill)}
              style={{ width: `${score}%` }}
            />
          </div>

          {/* Checklist of Issues */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {allChecks.map((check) => {
              const activeIssue = issues.find((issue) => issue.key === check.key);
              const hasIssue = !!activeIssue;

              return (
                <div
                  key={check.key}
                  className={cn(
                    'group rounded-xl border p-4 transition-all duration-200',
                    hasIssue
                      ? activeIssue.severity === 'critical'
                        ? 'border-red-500/20 bg-red-500/[0.03] hover:border-red-500/30'
                        : 'border-amber-500/20 bg-amber-500/[0.03] hover:border-amber-500/30'
                      : 'border-slate-800 bg-slate-950/20 hover:border-slate-700/50'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {hasIssue ? (
                          <AlertTriangle className={cn('h-4 w-4 shrink-0', activeIssue.severity === 'critical' ? 'text-red-400' : 'text-amber-400')} />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        )}
                        <p className="truncate text-xs font-bold text-slate-300 uppercase tracking-wider">{check.label}</p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-400 min-h-[40px]">
                        {hasIssue ? activeIssue.description : check.defaultDescription}
                      </p>
                    </div>
                    {hasIssue && (
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[10px] font-bold shrink-0',
                          activeIssue.severity === 'critical'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        )}
                      >
                        {activeIssue.count} Adet
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-end">
                    <Link
                      href={hasIssue ? activeIssue.href : check.href}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-semibold transition-colors',
                        hasIssue ? 'text-sky-400 hover:text-sky-300' : 'text-slate-500 group-hover:text-slate-400'
                      )}
                    >
                      {hasIssue ? activeIssue.actionLabel : check.actionLabel}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
