'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUPPORT_SCOPES, type SupportScope } from '@repo/types';
import { listSupportTargets, requestSupportSession } from '@/services/support-session.service';
import { supportButton, supportInput } from './support-session-ui';

export function SupportSessionRequestForm({ tenantId }: { tenantId: string }) {
  const client = useQueryClient();
  const [targetUserId, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [ticketId, setTicket] = useState('');
  const [durationMinutes, setDuration] = useState(30);
  const [scopes, setScopes] = useState<SupportScope[]>(['CONTACTS']);
  const [writeRequested, setWrite] = useState(false);
  const targets = useQuery({ queryKey: ['support-targets', tenantId], queryFn: () => listSupportTargets(tenantId) });
  const mutation = useMutation({
    mutationFn: () => requestSupportSession({ tenantId, targetUserId, reason, ticketId, durationMinutes, scopes, writeRequested }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['support-sessions', tenantId] }); },
  });
  return <form className="space-y-3 rounded-lg border border-slate-700 p-4" onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
    <h3 className="font-semibold text-white">Güvenli destek oturumu talep et</h3>
    <p className="text-sm text-slate-400">İlk 200 aktif kullanıcı. Tenant sahibi Ayarlar → Destek Erişimi sayfasından onaylamalıdır. Süre talep anında başlar.</p>
    <fieldset disabled={mutation.isPending} className="space-y-3">
      <label className="block">Hedef kullanıcı<select required className={supportInput} value={targetUserId} onChange={event => setTarget(event.target.value)}><option value="">Kullanıcı seçin</option>{targets.data?.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>
      {targets.isError && <p role="alert">Kullanıcılar alınamadı. <button type="button" onClick={() => void targets.refetch()}>Tekrar dene</button></p>}
      <label className="block">Gerekçe<textarea required minLength={10} maxLength={2000} className={supportInput} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <label className="block">Talep / ticket numarası<input required maxLength={120} className={supportInput} value={ticketId} onChange={event => setTicket(event.target.value)} /></label>
      <label className="block">Süre (5–60 dakika)<input type="number" required min={5} max={60} className={supportInput} value={durationMinutes} onChange={event => setDuration(Number(event.target.value))} /></label>
      <div className="flex flex-wrap gap-4">{SUPPORT_SCOPES.map(scope => <label key={scope} className="flex items-center gap-2"><input type="checkbox" checked={scopes.includes(scope)} onChange={event => {
        setScopes(previous => event.target.checked ? [...previous, scope] : previous.filter(item => item !== scope));
        if (scope === 'CONTACTS' && !event.target.checked) setWrite(false);
      }} />{scope === 'CONTACTS' ? 'Cari görüntüleme' : 'Ürün görüntüleme'}</label>)}</div>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={!scopes.includes('CONTACTS')} checked={writeRequested} onChange={event => setWrite(event.target.checked)} />Cari notu düzenleme için ayrıca izin talep et</label>
      <button className={supportButton} disabled={!targetUserId || !scopes.length || reason.trim().length < 10 || !ticketId.trim()}>Onaya gönder</button>
    </fieldset>
    {mutation.isError && <p role="alert" className="text-red-400">Talep oluşturulamadı. Bilgileri ve MFA oturumunu kontrol edin.</p>}
    {mutation.isSuccess && <p role="status" className="text-emerald-400">Talep tenant sahibinin onayına gönderildi.</p>}
  </form>;
}
