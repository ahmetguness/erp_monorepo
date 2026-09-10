'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupportScope, SupportSessionSummary } from '@repo/types';
import { readSupportRows, updateSupportContactNote } from '@/services/support-session.service';
import { supportButton, supportInput } from './support-session-ui';
import { useSupportSessionTime } from '@/hooks/useSupportSessionTime';

function ContactNoteEditor({ session, id, initialNote }: { session: SupportSessionSummary; id: string; initialNote: string }) {
  const [note, setNote] = useState(initialNote);
  const client = useQueryClient();
  const save = useMutation({ mutationFn: () => updateSupportContactNote(session, id, note), onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ['support-data', session.id] });
  } });
  return <form onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }} className="space-y-2">
    <textarea aria-label="Cari destek notu" maxLength={4000} className={supportInput} value={note} onChange={event => setNote(event.target.value)} disabled={save.isPending} />
    <button className={supportButton} disabled={save.isPending}>Notu kaydet</button>
    {save.isError && <p role="alert" className="text-red-400">Kaydedilemedi; izin veya oturum sona ermiş olabilir.</p>}
    {save.isSuccess && <p role="status" className="text-emerald-400">Kaydedildi.</p>}
  </form>;
}

export function SupportSessionViewer({ session, onExit }: { session: SupportSessionSummary; onExit: () => void }) {
  const now = useSupportSessionTime();
  const [scope, setScope] = useState<SupportScope>(session.scopes[0] ?? 'CONTACTS');
  const [page, setPage] = useState(1);
  const active = Boolean(session.approvedAt && !session.revokedAt && new Date(session.expiresAt).getTime() > now);
  const rows = useQuery({ queryKey: ['support-data', session.id, scope, page], queryFn: () => readSupportRows(session, scope, page), enabled: active, gcTime: 0, retry: false, refetchInterval: 10000 });
  return <div className="space-y-4">
    <div role="status" className="sticky top-0 z-30 rounded-lg border border-amber-500/50 bg-slate-950 p-4 text-amber-300 shadow-lg">
      <p className="font-semibold">DESTEK MODU · {session.targetUser.name} · {session.tenantId}</p>
      <p>{active ? (session.writeApprovedAt ? 'Ayrıca onaylı: yalnızca cari notu düzenleme' : 'Salt okunur') : 'Oturum sona erdi / onay bekliyor'}</p>
      <p className="text-sm">Bitiş: {new Date(session.expiresAt).toLocaleString('tr-TR')} · Talep: {session.ticketId}</p>
      <button className={`${supportButton} mt-2`} onClick={onExit}>Görünümden çık</button>
    </div>
    {active && <>
      <div className="flex gap-2">{session.scopes.map(item => <button className={supportButton} aria-pressed={scope === item} key={item} onClick={() => { setScope(item); setPage(1); }}>{item === 'CONTACTS' ? 'Cariler' : 'Ürünler'}</button>)}</div>
      <p className="text-sm text-slate-400">Hedef kullanıcının yetki ve modül sınırları uygulanır. Her veri isteği denetlenir; dışa aktarma ve diğer işlemler kapalıdır.</p>
      {rows.isPending && <p>Yükleniyor…</p>}
      {rows.isError && <p role="alert" className="text-red-400">Erişim reddedildi veya veri alınamadı. Oturum/yetki durumunu kontrol edin.</p>}
      {!rows.isError && rows.data && <>
        {rows.data.data.length === 0 && <p>Kayıt bulunamadı.</p>}
        {rows.data.data.map(row => <article key={row.id} className="space-y-2 rounded border border-slate-700 p-3"><h4>{row.name} {row.code && `· ${row.code}`}</h4><p className="whitespace-pre-wrap text-sm text-slate-400">{row.notes}</p>{scope === 'CONTACTS' && session.writeApprovedAt && <ContactNoteEditor key={`${row.id}:${row.notes ?? ''}`} session={session} id={row.id} initialNote={row.notes ?? ''} />}</article>)}
        <div className="flex items-center gap-3"><button className={supportButton} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Önceki</button><span>Sayfa {page}</span><button className={supportButton} disabled={page >= rows.data.meta.totalPages} onClick={() => setPage(value => value + 1)}>Sonraki</button></div>
      </>}
    </>}
  </div>;
}
