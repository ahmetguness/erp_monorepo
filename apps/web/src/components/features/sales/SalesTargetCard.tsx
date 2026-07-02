'use client';

import { FormEvent, useState } from 'react';
import { Target, Save } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { currentMonthKey } from '@/services/sales-target.service';
import { useMonthlySalesTarget, useUpdateMonthlySalesTarget } from '@/hooks/useSalesTargets';

interface SalesTargetCardProps {
  enabled: boolean;
}

function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
}

function parseTargetInput(value: string): number {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function SalesTargetCard({ enabled }: SalesTargetCardProps) {
  const month = currentMonthKey();
  const { data: target, isLoading } = useMonthlySalesTarget(month, { enabled });
  const updateTarget = useUpdateMonthlySalesTarget();
  const [draft, setDraft] = useState<{ value: string; isDirty: boolean }>({ value: '0', isDirty: false });

  if (!enabled) return null;

  const targetAmount = target?.targetAmount ?? 0;
  const actualAmount = target?.actualAmount ?? 0;
  const remainingAmount = target?.remainingAmount ?? 0;
  const progressPercent = target?.progressPercent ?? 0;
  const hasTarget = targetAmount > 0;
  const inputValue = draft.isDirty ? draft.value : String(targetAmount);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateTarget.mutate(
      { month, targetAmount: parseTargetInput(inputValue) },
      { onSuccess: (savedTarget) => setDraft({ value: String(savedTarget.targetAmount), isDirty: false }) },
    );
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/[0.03] overflow-hidden">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Target className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Aylık satış hedefi</h2>
              <span className="rounded-lg border border-slate-700 bg-slate-950/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                {formatMonthLabel(month)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Gerçekleşen satış, bu ay kesilen iptal/taslak olmayan satış faturalarından hesaplanır.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="sales-target-amount">Satış hedefi</label>
          <input
            id="sales-target-amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={inputValue}
            onChange={(event) => setDraft({ value: event.target.value, isDirty: true })}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-slate-600 focus:border-emerald-500/50 sm:w-40"
          />
          <button
            type="submit"
            disabled={updateTarget.isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Kaydet
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-slate-800/80 p-5 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
          <p className="text-xs text-slate-500">Hedef</p>
          <p className="mt-1 truncate text-lg font-bold text-white">{formatCurrency(targetAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
          <p className="text-xs text-slate-500">Gerçekleşen</p>
          <p className="mt-1 truncate text-lg font-bold text-emerald-400">{formatCurrency(actualAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
          <p className="text-xs text-slate-500">{hasTarget ? 'Kalan' : 'Durum'}</p>
          <p className="mt-1 truncate text-lg font-bold text-slate-200">
            {hasTarget ? formatCurrency(remainingAmount) : isLoading ? 'Yükleniyor' : 'Hedef bekleniyor'}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400">İlerleme</span>
          <span className={cn('font-bold', progressPercent >= 100 ? 'text-emerald-300' : 'text-slate-300')}>
            %{progressPercent}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all"
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
      </div>
    </section>
  );
}
