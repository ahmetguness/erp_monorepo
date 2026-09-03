'use client';
import { useState } from 'react';
import { Clock3, RotateCcw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { AuditEntityType } from '@/services/audit-log.service';
import { useRecordRecovery, useUndoOperation } from './use-record-recovery';
import type { RecoveryItem } from './record-recovery.schemas';

interface Props { entityType: AuditEntityType; entityId: string; displayName: string }
function valueLabel(value: string | number | boolean | null): string { if (value === null || value === '') return 'Boş'; if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'; return String(value); }

export function RecordRecoveryPanel({ entityType, entityId, displayName }: Props) {
  const context = { entityType, entityId };
  const query = useRecordRecovery(context);
  const undo = useUndoOperation(context);
  const [selected, setSelected] = useState<RecoveryItem | null>(null);
  const items = query.data ?? [];
  if (query.isError) {
    return <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><ShieldAlert className="h-4 w-4 text-red-400" /> Değişiklik güvenliği</h3>
      <p className="mt-2 text-xs text-red-300">Geri alma geçmişi alınamadı.</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => void query.refetch()}>Tekrar dene</Button>
    </section>;
  }
  if (!query.isLoading && items.length === 0) return null;
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><RotateCcw className="h-4 w-4 text-amber-400" /> Değişiklik güvenliği</h3>
    <p className="mt-1 text-xs text-slate-500">Ne değiştiğini görün, güvenliyse geri alın.</p>
    <div className="mt-3 space-y-2">
      {query.isLoading && <p className="text-xs text-slate-500">Değişiklikler kontrol ediliyor…</p>}
      {items.slice(0, 3).map((item) => <button type="button" key={item.auditLogId} onClick={() => setSelected(item)} className="w-full rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-amber-500/30">
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-200">{item.title}</span><Badge variant={item.canExecute ? 'warning' : item.mode === 'COMPENSATE' ? 'info' : 'neutral'}>{item.canExecute ? 'Geri alınabilir' : item.mode === 'COMPENSATE' ? 'Telafi gerekli' : 'Kapalı'}</Badge></div>
        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{item.explanation}</p>
      </button>)}
    </div>
    <Modal isOpen={selected !== null} onClose={() => setSelected(null)} title="Değişikliği incele" description={displayName} footer={<><Button variant="ghost" onClick={() => setSelected(null)}>Kapat</Button>{selected?.canExecute && <Button variant="danger" loading={undo.isPending} leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => undo.mutate(selected.auditLogId, { onSuccess: () => setSelected(null) })}>Önceki sürüme dön</Button>}</>}>
      {selected && <div className="space-y-4"><div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><p className="flex items-center gap-2 text-xs text-slate-300"><Clock3 className="h-3.5 w-3.5" /> {new Date(selected.occurredAt).toLocaleString('tr-TR')}</p><p className="mt-2 text-sm text-slate-400">{selected.explanation}</p></div>
        {selected.changes.length > 0 && <div className="overflow-hidden rounded-lg border border-slate-800">{selected.changes.map((change) => <div key={change.field} className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-b border-slate-800 px-3 py-2 text-xs last:border-0"><span className="text-slate-400">{change.label}</span><span className="line-through text-red-300/80">{valueLabel(change.before)}</span><span className="text-emerald-300">{valueLabel(change.after)}</span></div>)}</div>}
        {selected.impacts.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><p className="flex items-center gap-2 text-xs font-medium text-amber-300"><ShieldAlert className="h-3.5 w-3.5" /> Bağımlı kayıt etkisi</p><p className="mt-2 text-xs text-slate-400">{selected.impacts.map((impact) => `${impact.label}: ${impact.count}`).join(' · ')}</p></div>}
      </div>}
    </Modal>
  </section>;
}
