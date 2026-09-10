'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideSupportSession, listOwnerSupportSessions } from '@/services/support-session.service';
import { useAuthStore } from '@/store/auth.store';
import { useSupportSessionTime } from '@/hooks/useSupportSessionTime';

const button = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40';

export function SupportAccessPage() {
  const now = useSupportSessionTime();
  const tenant = useAuthStore(state => state.tenant);
  const user = useAuthStore(state => state.user);
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: ['owner-support-sessions', tenant?.id, user?.id], queryFn: listOwnerSupportSessions, enabled: Boolean(tenant && user), refetchInterval: 10000, retry: false });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'approve-write' | 'revoke' }) => decideSupportSession(id, action),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['owner-support-sessions'] }); },
  });
  return <div className="space-y-5 text-slate-300">
    <h1 className="text-xl font-semibold text-white">Destek Erişimi</h1>
    <p>Yalnızca tenant sahibi karar verebilir. Görüntüleme onayı salt okunurdur. Cari notu düzenleme ayrıca onaylanır. Dilediğiniz an erişimi iptal edebilirsiniz.</p>
    <button className={button} onClick={() => void sessions.refetch()} disabled={sessions.isFetching}>Yenile</button>
    {sessions.isPending && <p>Yükleniyor…</p>}
    {sessions.isError && <p role="alert" className="text-red-400">Bu ekran tenant sahibine özeldir veya talepler alınamadı.</p>}
    {decide.isError && <p role="alert" className="text-red-400">Karar kaydedilemedi; süre veya yetki değişmiş olabilir.</p>}
    {decide.isSuccess && <p role="status" className="text-emerald-400">Karar kaydedildi.</p>}
    {sessions.data?.length === 0 && <p>Destek talebi yok.</p>}
    {!sessions.isError && sessions.data?.map(session => {
      const inactive = Boolean(session.revokedAt) || new Date(session.expiresAt).getTime() <= now;
      return <article className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4" key={session.id}>
        <h2 className="font-semibold text-white">{session.admin.name} · {session.admin.email}</h2>
        <p>Hedef: {session.targetUser.name} · {session.targetUser.email}</p>
        <p>Gerekçe: {session.reason} · Talep: {session.ticketId}</p>
        <p>Kapsam: {session.scopes.map(scope => scope === 'CONTACTS' ? 'Cariler' : 'Ürünler').join(', ')} · Bitiş: {new Date(session.expiresAt).toLocaleString('tr-TR')}</p>
        <p>{inactive ? 'Sona erdi' : session.approvedAt ? 'Görüntüleme onaylı' : 'Onay bekliyor'} · {session.writeApprovedAt ? 'Cari notu yazma onaylı' : 'Salt okunur'}</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={inactive || Boolean(session.approvedAt) || decide.isPending} onClick={() => decide.mutate({ id: session.id, action: 'approve' })}>Salt okunur erişimi onayla</button>
          {session.writeRequested && <button className={button} disabled={inactive || !session.approvedAt || Boolean(session.writeApprovedAt) || decide.isPending} onClick={() => {
            if (window.confirm('Bu adminin hedef kullanıcının yetkileriyle cari notlarını değiştirmesine ayrıca izin veriyor musunuz?')) decide.mutate({ id: session.id, action: 'approve-write' });
          }}>Cari notu yazmayı ayrıca onayla</button>}
          <button className={button} disabled={inactive || decide.isPending} onClick={() => decide.mutate({ id: session.id, action: 'revoke' })}>Reddet / erişimi iptal et</button>
        </div>
      </article>;
    })}
  </div>;
}
