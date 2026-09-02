'use client';

import { useMemo, useState } from 'react';
import { GitMerge, Loader2, RotateCcw, ScanSearch, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { createUserAccessContext, hasUserPermission } from '@/domain/access/user-access-context';
import { useCurrentUser } from '@/hooks/useAuth';
import { useDuplicateCandidates, useMergeContacts, usePreviewContactMerge, useRollbackContactMerge } from '@/hooks/useDataExchange';
import type { ContactMergeInput, ContactMergeResult, DedupEntity, DuplicateCandidate } from '@/services/data-exchange.service';

const ENTITIES: Array<{ value: DedupEntity; label: string; module: string }> = [
  { value: 'contacts', label: 'Cariler', module: 'contacts' }, { value: 'products', label: 'Ürünler', module: 'inventory' }, { value: 'invoices', label: 'Faturalar', module: 'invoicing' },
];
const CONTACT_FIELDS = ['name', 'taxNumber', 'taxOffice', 'email', 'phone', 'website', 'address', 'city', 'country', 'notes', 'creditLimit', 'paymentTermDays'] as const;

function CandidateCard({ candidate, selected, onSelect }: { candidate: DuplicateCandidate; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-100">{candidate.left.label}</p><p className="mt-1 text-xs text-slate-500">{candidate.right.label}</p></div><Badge variant={candidate.risk === 'low' ? 'success' : candidate.risk === 'medium' ? 'warning' : 'danger'}>%{Math.round(candidate.score * 100)}</Badge></div>
      <div className="mt-2 flex flex-wrap gap-1.5">{candidate.reasons.map((reason) => <Badge key={reason.field} variant="neutral">{reason.description}</Badge>)}</div>
      {!candidate.mergeSupported && <p className="mt-2 text-xs text-amber-400">{candidate.mergeBlockedReason}</p>}
    </button>
  );
}

export function DataDeduplicationCenter() {
  const { user, tenant } = useCurrentUser();
  const access = createUserAccessContext(user, tenant);
  const [entity, setEntity] = useState<DedupEntity>('contacts');
  const selectedModule = ENTITIES.find((item) => item.value === entity)?.module ?? 'contacts';
  const canRead = hasUserPermission(access, selectedModule, 'READ');
  const canMerge = hasUserPermission(access, 'contacts', 'UPDATE');
  const candidates = useDuplicateCandidates(entity, canRead);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = candidates.data?.find((candidate) => candidate.id === selectedId) ?? null;
  const [sourceSide, setSourceSide] = useState<'left' | 'right'>('left');
  const [fieldWinners, setFieldWinners] = useState<Record<string, 'source' | 'target'>>({});
  const [mergeResult, setMergeResult] = useState<ContactMergeResult | null>(null);
  const preview = usePreviewContactMerge();
  const merge = useMergeContacts();
  const rollback = useRollbackContactMerge();
  const input = useMemo<ContactMergeInput | null>(() => selected ? { sourceId: sourceSide === 'left' ? selected.left.id : selected.right.id, targetId: sourceSide === 'left' ? selected.right.id : selected.left.id, fieldWinners } : null, [fieldWinners, selected, sourceSide]);

  return (
    <section className="mb-5 space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><ScanSearch className="h-4 w-4 text-purple-400" /><h2 className="text-sm font-semibold text-slate-200">Mükerrer Kayıt Merkezi</h2></div><p className="mt-1 text-xs text-slate-500">Eşleşme nedenlerini açıklar; riskli varlıkları otomatik birleştirmez.</p></div><Select value={entity} onChange={(event) => { setEntity(event.target.value as DedupEntity); setSelectedId(null); preview.reset(); }} options={ENTITIES.map(({ value, label }) => ({ value, label }))} /></div>
      {!canRead ? <p className="text-xs text-amber-400">Bu varlık için okuma yetkiniz yok.</p> : candidates.isLoading ? <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Tenant verisi taranıyor</div> : candidates.data?.length === 0 ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">Belirlenen eşik üzerinde mükerrer aday bulunmadı.</p> : <div className="grid gap-3 lg:grid-cols-2">{candidates.data?.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} selected={selectedId === candidate.id} onSelect={() => { setSelectedId(candidate.id); preview.reset(); setMergeResult(null); }} />)}</div>}
      {selected?.mergeSupported && input && <div className="space-y-3 rounded-lg border border-sky-500/20 bg-slate-950/50 p-4">
        <div className="flex items-center gap-2"><GitMerge className="h-4 w-4 text-sky-400" /><h3 className="text-sm font-semibold text-slate-100">Cari birleştirme planı</h3></div>
        <Select label="Kaynak (birleştirme sonrası pasif olur)" value={sourceSide} onChange={(event) => { setSourceSide(event.target.value as 'left' | 'right'); preview.reset(); }} options={[{ value: 'left', label: selected.left.label }, { value: 'right', label: selected.right.label }]} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CONTACT_FIELDS.map((field) => <Select key={field} label={field} value={fieldWinners[field] ?? 'target'} onChange={(event) => { setFieldWinners((current) => ({ ...current, [field]: event.target.value as 'source' | 'target' })); preview.reset(); }} options={[{ value: 'target', label: 'Hedef değeri' }, { value: 'source', label: 'Kaynak değeri' }]} />)}</div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!canMerge || preview.isPending} onClick={() => preview.mutate(input)}>Planı önizle</Button><Button disabled={!canMerge || !preview.data || merge.isPending} onClick={() => merge.mutate(input, { onSuccess: setMergeResult })}>Onayla ve birleştir</Button></div>
        {preview.data && <div className="rounded-lg border border-slate-800 p-3 text-xs text-slate-400"><p>{preview.data.totalReferences} bağlı kayıt hedef cariye taşınacak.</p><div className="mt-2 flex flex-wrap gap-1">{Object.entries(preview.data.references).filter(([, count]) => count > 0).map(([name, count]) => <Badge key={name} variant="info">{name}: {count}</Badge>)}</div>{preview.data.warnings.map((warning) => <p key={warning} className="mt-2 text-amber-400">{warning}</p>)}</div>}
        {mergeResult && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"><p className="text-xs text-emerald-300">Birleştirme tamamlandı. Audit: {mergeResult.auditLogId}</p><Button className="mt-2" size="sm" variant="outline" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} loading={rollback.isPending} onClick={() => rollback.mutate(mergeResult.auditLogId, { onSuccess: () => setMergeResult(null) })}>Birleştirmeyi geri al</Button></div>}
        {!canMerge && <div className="flex items-center gap-2 text-xs text-amber-400"><ShieldAlert className="h-4 w-4" /> Cari güncelleme yetkisi gerekir.</div>}
      </div>}
    </section>
  );
}
