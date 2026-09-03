'use client';
import Link from 'next/link';
import { AlertTriangle, Bot, Clock3, Loader2, RefreshCw, Repeat2, Settings2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useFinanceOperationsWorkspace, useRunFinanceOperations, useUpdateFinanceOperationsPolicy } from './useFinanceOperations';
import type { FinanceOperationsPolicy } from './finance-operations.service';
import { useCurrentUser } from '@/hooks/useAuth';
import { createUserAccessContext, hasUserPermission } from '@/domain/access/user-access-context';

export function FinanceOperationsWorkspace() {
  const { user, tenant } = useCurrentUser();
  const canUpdate = hasUserPermission(createUserAccessContext(user, tenant), 'accounting', 'UPDATE');
  const { data, isLoading } = useFinanceOperationsWorkspace();
  const run = useRunFinanceOperations();
  const update = useUpdateFinanceOperationsPolicy();
  if (isLoading) return <div className="rounded-2xl border border-slate-800 p-6 text-sm text-slate-400">Finans istisna kuyruğu hazırlanıyor…</div>;
  if (!data) return null;
  const save = (policy: FinanceOperationsPolicy) => update.mutate(policy);
  return (
    <section className="space-y-4 rounded-2xl border border-emerald-500/20 bg-slate-900/80 p-5 shadow-xl">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div><div className="flex items-center gap-2 font-bold text-white"><Bot className="h-5 w-5 text-emerald-400" /> Günlük finans istisna kuyruğu</div><p className="mt-1 text-xs text-slate-400">Normal kayıtlar politika kapsamında ilerler; yalnızca karar gerektiren işler burada kalır.</p></div>
        <div className="flex gap-2">
          {canUpdate && <button disabled={run.isPending || !data.policy.autoProcessEnabled} onClick={() => run.mutate()} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Normal kayıtları işle</button>}
          {canUpdate && <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"><Settings2 className="h-4 w-4" /> Politika</summary><div className="absolute right-0 z-20 mt-2 grid w-72 gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs shadow-2xl"><label className="flex gap-2"><input type="checkbox" checked={data.policy.autoProcessEnabled} onChange={(event) => save({ ...data.policy, autoProcessEnabled: event.target.checked })} /> Yüksek güvenli kayıtları otomatik işle</label><label>Minimum güven: %{data.policy.autoMatchMinConfidence}<input className="w-full" type="range" min="75" max="100" value={data.policy.autoMatchMinConfidence} onChange={(event) => save({ ...data.policy, autoMatchMinConfidence: Number(event.target.value) })} /></label><label>Besleme gecikme sınırı<input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-1.5" type="number" min="1" max="168" value={data.policy.feedStaleHours} onChange={(event) => save({ ...data.policy, feedStaleHours: Number(event.target.value) })} /></label></div></details>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Otomatik işlendi" value={data.summary.automaticallyProcessed} /><Metric label="Otomasyona hazır" value={data.summary.readyForAutomaticProcessing} /><Metric label="İstisna" value={data.summary.exceptions} /><Metric label="Düzenli işlem" value={data.summary.recurringPatterns} /></div>
      {data.feed.stale && <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"><Clock3 className="h-4 w-4" /> Banka beslemesi güncel değil; otomatik akış yeni kayıt bekliyor.</div>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-2"><h3 className="text-xs font-bold uppercase text-slate-400">Karar bekleyenler</h3>{data.exceptions.length === 0 ? <p className="rounded-xl border border-slate-800 p-4 text-sm text-emerald-400">Finans istisnası yok.</p> : data.exceptions.slice(0, 12).map((item) => <Link key={item.id} href={item.href} className="block rounded-xl border border-slate-800 p-3 hover:border-amber-500/40"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold text-white"><AlertTriangle className="h-4 w-4 text-amber-400" />{item.title}</span>{item.amount !== null && <span className="text-xs text-slate-300">{formatCurrency(item.amount, 'TRY')}</span>}</div><p className="mt-1 text-xs text-slate-400">{item.detail}</p></Link>)}</div>
        <div className="space-y-2"><h3 className="text-xs font-bold uppercase text-slate-400">Öğrenilen düzenli işlemler</h3>{data.recurringPatterns.length === 0 ? <p className="rounded-xl border border-slate-800 p-4 text-xs text-slate-500">Henüz yeterli tekrar yok.</p> : data.recurringPatterns.map((pattern) => <div key={pattern.key} className="rounded-xl border border-slate-800 p-3"><div className="flex items-center gap-2 text-sm text-white"><Repeat2 className="h-4 w-4 text-sky-400" />{pattern.description}</div><p className="mt-1 text-xs text-slate-400">{pattern.occurrences} tekrar · Ortalama {formatCurrency(pattern.averageAmount, 'TRY')}</p></div>)}</div>
      </div>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="text-xl font-black text-white">{value}</p></div>; }
