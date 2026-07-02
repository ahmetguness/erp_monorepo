'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { useSetupChecklist } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';
import type { SetupChecklistItem } from '@/services/settings.service';

interface SetupChecklistCardProps {
  enabled?: boolean;
  compact?: boolean;
}

const ITEM_TONE: Record<SetupChecklistItem['severity'], string> = {
  required: 'text-sky-300',
  recommended: 'text-amber-300',
};

function statusIcon(item: SetupChecklistItem) {
  if (item.completed) return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (item.severity === 'recommended') return <AlertCircle className="h-4 w-4 text-amber-400" />;
  return <Circle className="h-4 w-4 text-sky-400" />;
}

export function SetupChecklistCard({ enabled = true, compact = false }: SetupChecklistCardProps) {
  const { data, isLoading } = useSetupChecklist({ enabled });

  if (!enabled) return null;

  const items = data?.items ?? [];
  const summary = data?.summary;
  const completed = summary?.completed ?? 0;
  const total = summary?.total ?? 5;
  const percent = summary?.percent ?? 0;
  const finished = summary ? summary.remaining === 0 : false;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-500/10 p-2">
            <ListChecks className="h-4 w-4 text-sky-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Kurulum kontrol listesi</h2>
            <p className="mt-0.5 text-xs text-slate-500">Cari, urun, vergi, para birimi ve fatura seri hazirligi</p>
          </div>
        </div>
        <div className="min-w-36">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">{completed}/{total}</span>
            <span className={cn('font-semibold', finished ? 'text-emerald-300' : 'text-sky-300')}>%{percent}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn('h-full rounded-full transition-all', finished ? 'bg-emerald-400' : 'bg-sky-400')}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 py-6 text-sm text-slate-500">Kurulum durumu yukleniyor...</div>
      ) : (
        <div className={cn('grid gap-2 p-4', compact ? 'lg:grid-cols-5' : 'md:grid-cols-2 xl:grid-cols-5')}>
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'group rounded-xl border p-3 transition-colors',
                item.completed
                  ? 'border-emerald-500/20 bg-emerald-500/[0.04] hover:border-emerald-500/35'
                  : 'border-slate-800 bg-slate-950/35 hover:border-slate-700 hover:bg-slate-800/35',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {statusIcon(item)}
                    <p className="truncate text-sm font-semibold text-slate-100">{item.label}</p>
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-4 text-slate-500">{item.description}</p>
                </div>
                <span className={cn('rounded-lg bg-slate-950/60 px-2 py-0.5 text-xs font-bold tabular-nums', ITEM_TONE[item.severity])}>
                  {item.count}
                </span>
              </div>
              <div className="mt-3 text-xs font-semibold text-sky-300 transition-colors group-hover:text-sky-200">
                {item.completed ? 'Goruntule' : item.actionLabel}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
