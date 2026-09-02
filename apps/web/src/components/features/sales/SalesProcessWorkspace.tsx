'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, FileCheck2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useSalesProcessWorkspace } from '@/hooks/useSales';
import { formatCurrency, formatDate } from '@/lib/utils';

interface SalesProcessWorkspaceProps {
  orderId: string;
  onFulfill: () => void;
}

const STAGE_LABELS = { QUOTE: 'Teklif', ORDER: 'Sipariş', DELIVERY: 'İrsaliye', INVOICE: 'Fatura', PAYMENT: 'Tahsilat' } as const;
const HEALTH_LABELS = { HEALTHY: 'Sağlıklı', AT_RISK: 'Dikkat gerekli', BLOCKED: 'Bloke', COMPLETED: 'Tamamlandı' } as const;

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-400">{label}</span><strong className="text-slate-200">%{value}</strong></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function SalesProcessWorkspace({ orderId, onFulfill }: SalesProcessWorkspaceProps) {
  const router = useRouter();
  const { data: workspace, isLoading } = useSalesProcessWorkspace(orderId);
  if (isLoading) return <section className="flex min-h-40 items-center justify-center rounded-xl border border-slate-800 bg-slate-900"><Spinner /></section>;
  if (!workspace) return null;
  const healthy = workspace.health === 'HEALTHY' || workspace.health === 'COMPLETED';

  const executeNextAction = (): void => {
    if (workspace.nextAction.kind === 'FULFILL') onFulfill();
    else if (workspace.nextAction.href) router.push(workspace.nextAction.href);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div><div className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-sky-300" /><h2 className="text-sm font-semibold text-white">Satış iş dosyası</h2></div><p className="mt-1 text-xs text-slate-500">Tekliften tahsilata bütün süreç tek görünümde</p></div>
        <span className={healthy ? 'rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300' : 'rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300'}>{HEALTH_LABELS[workspace.health]}</span>
      </header>
      <div className="grid gap-5 p-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-4">
          <ProgressMetric label="Teslimat" value={workspace.progress.deliveryPercent} />
          <ProgressMetric label="Faturalama" value={workspace.progress.invoicedPercent} />
          <ProgressMetric label="Tahsilat" value={workspace.progress.collectedPercent} />
          {workspace.nextAction.kind !== 'NONE' && <Button className="w-full" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />} onClick={executeNextAction}>{workspace.nextAction.label}</Button>}
        </div>
        <div className="min-w-0">
          <div className="flex gap-3 overflow-x-auto pb-3">
            {workspace.timeline.map((stage, index) => (
              <button key={`${stage.kind}-${stage.id}`} type="button" onClick={() => router.push(stage.href)} className="min-w-40 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-left hover:border-sky-500/40">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">{index === workspace.timeline.length - 1 ? <CircleDot className="h-3 w-3 text-sky-400" /> : <CheckCircle2 className="h-3 w-3 text-emerald-400" />}{STAGE_LABELS[stage.kind]}</div>
                <p className="mt-2 truncate text-xs font-semibold text-slate-200">{stage.number}</p>
                <p className="mt-1 text-[11px] text-slate-500">{stage.status} · {formatDate(stage.occurredAt)}</p>
                {stage.amount !== null && <p className="mt-2 text-xs font-medium text-slate-300">{formatCurrency(stage.amount)}</p>}
              </button>
            ))}
          </div>
          {workspace.blockers.length > 0 && <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />Eksikler ve blokajlar</div><ul className="space-y-1 text-xs text-slate-400">{workspace.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul></div>}
        </div>
      </div>
    </section>
  );
}
