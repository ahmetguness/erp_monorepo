'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endSupportSession, listAdminSupportSessions } from '@/services/support-session.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { SupportSessionRequestForm } from './SupportSessionRequestForm';
import { SupportSessionViewer } from './SupportSessionViewer';
import { supportButton } from './support-session-ui';
import { useSupportSessionTime } from '@/hooks/useSupportSessionTime';

export function AdminSupportSessions({ tenantId }: { tenantId: string }) {
  const now = useSupportSessionTime();
  const admin = useAdminAuthStore(state => state.admin);
  const allowed = canAdmin(admin, 'support-session.manage');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: ['support-sessions', tenantId, admin?.id], queryFn: () => listAdminSupportSessions(tenantId), enabled: allowed, refetchInterval: 10000, retry: false });
  const selected = !sessions.isError && allowed ? sessions.data?.find(session => session.id === selectedId) : undefined;
  const end = useMutation({ mutationFn: (id: string) => endSupportSession(tenantId, id), onSuccess: async (_, id) => {
    setSelectedId(null);
    client.removeQueries({ queryKey: ['support-data', id] });
    await client.invalidateQueries({ queryKey: ['support-sessions', tenantId] });
  } });
  if (!allowed) return null;
  return <section className="space-y-4 border-b border-slate-700 pb-6">
    {selected && <SupportSessionViewer key={selected.id} session={selected} onExit={() => end.mutate(selected.id)} />}
    <SupportSessionRequestForm key={tenantId} tenantId={tenantId} />
    <div className="flex items-center justify-between"><h3>Destek oturumlarım (son 100)</h3><button className={supportButton} onClick={() => void sessions.refetch()} disabled={sessions.isFetching}>Yenile</button></div>
    {sessions.isError && <p role="alert" className="text-red-400">Oturum bilgileri alınamadı; destek görünümü kapatıldı.</p>}
    {end.isError && <p role="alert" className="text-red-400">Oturum sonlandırılamadı. Yeniden deneyin.</p>}
    {sessions.data?.map(session => <article key={session.id} className="space-y-2 rounded-lg border border-slate-700 p-3">
      <p>{session.targetUser.name} · {session.ticketId} · {session.scopes.join(', ')}</p>
      <p className="text-sm text-slate-400">{session.reason} · Bitiş: {new Date(session.expiresAt).toLocaleString('tr-TR')}</p>
      <p>{session.revokedAt ? 'Sonlandırıldı' : new Date(session.expiresAt).getTime() <= now ? 'Süresi doldu' : !session.approvedAt ? 'Sahip onayı bekliyor' : 'Görüntüleme onaylı'} {session.writeApprovedAt ? '· Cari notu yazma onaylı' : '· Salt okunur'}</p>
      <div className="flex gap-2">
        <button className={supportButton} disabled={!session.approvedAt || Boolean(session.revokedAt) || new Date(session.expiresAt).getTime() <= now} onClick={() => setSelectedId(session.id)}>Kullanıcı adına görüntüle</button>
        <button className={supportButton} disabled={Boolean(session.revokedAt) || end.isPending} onClick={() => end.mutate(session.id)}>Sonlandır</button>
      </div>
    </article>)}
  </section>;
}
