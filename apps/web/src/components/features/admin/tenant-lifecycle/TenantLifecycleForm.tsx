'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClosureChecklist, TenantLifecycleInput, TenantLifecycleSnapshot, TenantLifecycleStatus } from '@repo/types';
import { requestTenantLifecycle } from '@/services/tenant-lifecycle.service';
import { toast } from '@/store/ui.store';
import { toastAdminError } from '@/lib/admin/errors';

const inputStyle = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500';
const button = 'rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-40';
const checklistLabels: Record<keyof ClosureChecklist, string> = {
  ownerNotified: 'Tenant sahibine kapanış bildirildi', balancesReviewed: 'Bakiye ve açık işlemler incelendi',
  externalBackupVerified: 'Dosyalar dahil ayrı tam yedek alındı ve doğrulandı', retentionReviewed: 'Yasal saklama gereklilikleri yetkili kişi tarafından incelendi',
};

export function TenantLifecycleForm({ snapshot }: { snapshot: TenantLifecycleSnapshot }) {
  const [action, setAction] = useState<'TRANSITION' | 'LEGAL_HOLD'>('TRANSITION');
  const [targetStatus, setTarget] = useState<TenantLifecycleStatus | undefined>(snapshot.transitions[0]);
  const [legalHold, setHold] = useState(snapshot.legalHold);
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState('');
  const [ticketId, setTicket] = useState('');
  const [retentionUntil, setRetention] = useState('');
  const [deletionNotBefore, setDeletion] = useState('');
  const [exportId, setExport] = useState(snapshot.exports[0]?.id ?? '');
  const [checklist, setChecklist] = useState<ClosureChecklist>({ ownerNotified: false, balancesReviewed: false, externalBackupVerified: false, retentionReviewed: false });
  const [proposal, setProposal] = useState<TenantLifecycleInput | null>(null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: TenantLifecycleInput) => requestTenantLifecycle(snapshot.tenantId, input),
    onSuccess: async () => {
      toast.success('Yaşam döngüsü talebi ikinci admin onayına iletildi.');
      setProposal(null);
      await client.invalidateQueries({ queryKey: ['tenant-lifecycle', snapshot.tenantId] });
    },
    onError: (err: unknown) => {
      toastAdminError(err, 'Talep oluşturulamadı. Tarihleri ve kuralları kontrol edin.');
    },
  });
  const deleting = action === 'TRANSITION' && (targetStatus === 'DELETION_SCHEDULED' || targetStatus === 'DELETED');
  return <form className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4" onSubmit={event => {
    event.preventDefault();
    setProposal({ action, ...(action === 'TRANSITION' ? { targetStatus } : { legalHold }), reason, impact, ticketId,
      ...(retentionUntil ? { retentionUntil: new Date(`${retentionUntil}T23:59:59.999Z`).toISOString() } : {}),
      ...(action === 'TRANSITION' && targetStatus === 'DELETION_SCHEDULED' && deletionNotBefore ? { deletionNotBefore: new Date(`${deletionNotBefore}T23:59:59.999Z`).toISOString() } : {}),
      ...(deleting ? { exportId, checklist } : {}),
    });
  }}>
    <h2 className="font-semibold text-white">Yaşam döngüsü talebi</h2>
    <fieldset disabled={Boolean(proposal) || mutation.isPending} className="space-y-3">
      <label className="block">İşlem<select className={inputStyle} value={action} onChange={event => setAction(event.target.value === 'LEGAL_HOLD' ? 'LEGAL_HOLD' : 'TRANSITION')}><option value="TRANSITION">Durum geçişi</option><option value="LEGAL_HOLD">Hukuki bekletme / saklama</option></select></label>
      {action === 'TRANSITION' ? <label className="block">İzin verilen hedef durum<select required className={inputStyle} value={targetStatus ?? ''} onChange={event => setTarget(snapshot.transitions.find(status => status === event.target.value))}>{snapshot.transitions.map(status => <option key={status} value={status}>{status}</option>)}</select></label> : <label className="flex gap-2"><input type="checkbox" checked={legalHold} onChange={event => setHold(event.target.checked)} />Hukuki bekletme aktif</label>}
      <label className="block">Gerekçe<textarea className={inputStyle} required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <label className="block">Kullanıcı / iş etkisi<textarea className={inputStyle} required minLength={10} maxLength={2000} value={impact} onChange={event => setImpact(event.target.value)} /></label>
      <label className="block">Ticket<input required maxLength={120} className={inputStyle} value={ticketId} onChange={event => setTicket(event.target.value)} /></label>
      <label className="block">Saklama bitiş tarihi (UTC gün sonu)<input type="date" required={deleting && targetStatus === 'DELETION_SCHEDULED'} className={inputStyle} value={retentionUntil} onChange={event => setRetention(event.target.value)} /></label>
      {deleting && <div className="space-y-3 rounded-lg border border-amber-500/30 p-3">
        <p className="text-amber-300">Silme mantıksaldır; veri kalıcı olarak temizlenmez. Bekleme, hukuki bekletme, saklama, güncel export ve ikinci admin onayı zorunludur.</p>
        {targetStatus === 'DELETION_SCHEDULED' && <label className="block">En erken silme tarihi (en az 30 gün)<input required type="date" className={inputStyle} value={deletionNotBefore} onChange={event => setDeletion(event.target.value)} /></label>}
        <label className="block">Güncel iş verisi export<select required className={inputStyle} value={exportId} onChange={event => setExport(event.target.value)}><option value="">Export seçin</option>{snapshot.exports.filter(item => item.version === snapshot.version).map(item => <option key={item.id} value={item.id}>{item.createdAt} · {item.digest.slice(0, 12)}</option>)}</select></label>
        {(Object.keys(checklistLabels) as Array<keyof ClosureChecklist>).map(key => <label className="flex gap-2" key={key}><input required type="checkbox" checked={checklist[key]} onChange={event => setChecklist(previous => ({ ...previous, [key]: event.target.checked }))} />{checklistLabels[key]}</label>)}
      </div>}
      <button className={button} disabled={reason.trim().length < 10 || impact.trim().length < 10 || !ticketId.trim()}>Değişikliği önizle</button>
    </fieldset>
    {proposal && <div className="space-y-2 rounded-lg border border-blue-500/40 p-4">
      <h3 className="font-semibold text-white">Önizleme: {snapshot.status} → {proposal.targetStatus ?? `Hukuki bekletme: ${proposal.legalHold ? 'Aktif' : 'Pasif'}`}</h3>
      <p>Gerekçe: {proposal.reason}</p><p>Etki: {proposal.impact}</p><p>Ticket: {proposal.ticketId}</p>
      <p>Uygulama tarihi: ikinci adminin onay anı. Silme planı: {proposal.deletionNotBefore ?? '—'}. Saklama: {proposal.retentionUntil ?? snapshot.retentionUntil ?? '—'}</p>
      <p>Bu işlem tek başınıza uygulanmaz; başka bir yetkili adminin onayı gerekir.</p>
      <div className="flex gap-3"><button type="button" className={button} disabled={mutation.isPending} onClick={() => mutation.mutate(proposal)}>İkinci admin onayına gönder</button><button type="button" disabled={mutation.isPending} onClick={() => setProposal(null)}>Düzenle</button></div>
    </div>}
    {mutation.isError && <p role="alert" className="text-red-400">Talep oluşturulamadı. Tarihleri, geçiş kurallarını ve bekleyen talepleri kontrol edin.</p>}
  </form>;
}
