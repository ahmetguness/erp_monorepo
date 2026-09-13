'use client';

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import { usePilotReadiness } from './usePilotReadiness';

export function PilotReadinessDashboard() {
  const { data, error, isLoading, isFetching, refetch } = usePilotReadiness();

  if (isLoading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /></div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-800 bg-rose-950/30 p-6 text-rose-200">
        <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5" /> Pilot hazırlık verisi alınamadı</div>
        <p className="mt-2 text-sm text-rose-300/80">Karar güvenli biçimde NO-GO kabul edilmelidir.</p>
      </div>
    );
  }

  const isGo = data.decision === 'GO';

  return (
    <div className="space-y-6">
      <section className={cn('rounded-2xl border p-6 shadow-xl', isGo ? 'border-emerald-700 bg-emerald-950/25' : 'border-rose-800 bg-rose-950/25')}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"><ShieldCheck className="h-4 w-4" /> Pilot karar kapısı</div>
            <h1 className={cn('mt-2 text-4xl font-black', isGo ? 'text-emerald-400' : 'text-rose-400')}>{isGo ? 'GO' : 'NO-GO'}</h1>
            <p className="mt-1 text-sm text-slate-400">Son hesaplama: {formatDateTime(data.generatedAt)}</p>
          </div>
          <button type="button" onClick={() => void refetch()} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Yeniden değerlendir
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.checks.map((check) => {
          const passed = check.status === 'PASS';
          const Icon = passed ? CheckCircle2 : XCircle;
          return (
            <article key={check.key} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
              <div className="flex items-start gap-3">
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', passed ? 'text-emerald-400' : 'text-rose-400')} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-white">{check.label}</h2>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-black', passed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>{check.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{check.detail}</p>
                  <ul className="mt-3 space-y-1 text-xs text-slate-500">
                    {check.evidence.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
