'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, Clock3, ListTodo, ShieldAlert, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useCompleteTodayWorkItem, useTodayWorkQueue } from '@/hooks/useTodayWorkQueue';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import type { TodayWorkItem } from '@/services/today-work-queue.service';

const KIND_LABELS: Record<TodayWorkItem['kind'], string> = { TASK: 'Görev', APPROVAL: 'Onay', ANOMALY: 'Anomali', DATA_QUALITY: 'Veri kalitesi', AUTOMATION_EXCEPTION: 'Otomasyon' };
const RISK_STYLE: Record<TodayWorkItem['risk'], string> = { LOW: 'text-slate-400 bg-slate-800', MEDIUM: 'text-sky-300 bg-sky-500/10', HIGH: 'text-amber-300 bg-amber-500/10', CRITICAL: 'text-red-300 bg-red-500/10' };

function WorkCard({ item }: { item: TodayWorkItem }) {
  const complete = useCompleteTodayWorkItem();
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{KIND_LABELS[item.kind]}</span><span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', RISK_STYLE[item.risk])}>{item.risk}</span>{item.sla.state === 'BREACHED' && <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-300">SLA aşıldı</span>}</div><h3 className="mt-2 truncate text-sm font-semibold text-slate-100">{item.title}</h3><p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.detail ?? item.reason}</p></div><span className="text-sm font-bold text-slate-500">{item.score}</span></div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">{item.dueAt && <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDateTime(item.dueAt)}</span>}{item.monetaryImpact !== null && <span className="flex items-center gap-1 text-amber-300"><Wallet className="h-3 w-3" />{formatCurrency(item.monetaryImpact)}</span>}{item.assignee && <span>{item.assignee.name}</span>}</div>
      <p className="mt-3 rounded-lg bg-slate-900 px-2.5 py-2 text-[11px] text-slate-500">{item.reason}</p>
      <div className="mt-3 flex gap-2"><Link href={item.action.href} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800">Aç <ArrowRight className="h-3 w-3" /></Link>{item.action.kind === 'COMPLETE' && <Button size="sm" leftIcon={<Check className="h-3 w-3" />} loading={complete.isPending} onClick={() => complete.mutate(item.sourceId)}>{item.action.label}</Button>}</div>
    </article>
  );
}

export function TodayWorkQueue({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useTodayWorkQueue(enabled);
  if (!enabled) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4"><div><div className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-sky-300" /><h2 className="text-sm font-semibold text-white">Bugün</h2></div><p className="mt-1 text-xs text-slate-500">Rolünüze, riske, SLA&apos;ya ve finansal etkiye göre sıralandı</p></div>{data && <div className="flex gap-2 text-xs"><span className="rounded-lg bg-slate-800 px-2 py-1 text-slate-300">{data.summary.total} iş</span>{data.summary.critical > 0 && <span className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-red-300"><ShieldAlert className="h-3 w-3" />{data.summary.critical} kritik</span>}{data.summary.breached > 0 && <span className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-amber-300"><AlertTriangle className="h-3 w-3" />{data.summary.breached} SLA</span>}</div>}</header>
      <div className="p-4">{isLoading ? <div className="flex min-h-32 items-center justify-center"><Spinner /></div> : data?.items.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.items.slice(0, 9).map((item) => <WorkCard key={item.id} item={item} />)}</div> : <div className="py-10 text-center text-sm text-slate-500">Bugün için açık veya riskli iş bulunmuyor.</div>}</div>
    </section>
  );
}
