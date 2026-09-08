'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminRoleKey, AdminUserSummary, InviteAdminInput, UpdateAdminInput } from '@repo/types';
import { listAdminUsers, inviteAdminUser, updateAdminUser, revokeAdminUserSessions } from '@/services/admin-users.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { AdminRoleSelector } from '@/components/features/admin/AdminRoleSelector';
import { AdminUserEditor } from '@/components/features/admin/AdminUserEditor';

function messageFrom(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const detail = error.error;
    if (typeof detail === 'object' && detail !== null && 'message' in detail && typeof detail.message === 'string') return detail.message;
  }
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}
const dateLabel = (value: string | null): string => value ? new Date(value).toLocaleString('tr-TR') : '—';

export default function AdminUsersPage() {
  const admin = useAdminAuthStore((state) => state.admin);
  const canManage = canAdmin(admin, 'admin-user.manage');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<AdminRoleKey[]>(['READ_ONLY_AUDITOR']);
  const [editing, setEditing] = useState<AdminUserSummary | null>(null);
  const [message, setMessage] = useState('');
  const users = useQuery({ queryKey: ['admin', 'admin-users'], queryFn: listAdminUsers, enabled: canAdmin(admin, 'admin-user.read') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'admin-users'] });
  const invite = useMutation({ mutationFn: (input: InviteAdminInput) => inviteAdminUser(input), onSuccess: async () => {
    setName(''); setEmail(''); setMessage('Davet e-postası gönderildi.'); await refresh();
  }, onError: (error) => setMessage(messageFrom(error)) });
  const update = useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateAdminInput }) => updateAdminUser(id, input), onSuccess: async (_, { id }) => {
    setEditing(null); setMessage('Hesap güncellendi ve oturumlar kapatıldı.');
    if (id === admin?.id) window.location.assign('/admin/login'); else await refresh();
  }, onError: (error) => setMessage(messageFrom(error)) });
  const revoke = useMutation({ mutationFn: revokeAdminUserSessions, onSuccess: async (_, id) => {
    setMessage('Yöneticinin tüm oturumları kapatıldı.');
    if (id === admin?.id) window.location.assign('/admin/login'); else await refresh();
  }, onError: (error) => setMessage(messageFrom(error)) });
  const pending = invite.isPending || update.isPending || revoke.isPending;
  return <div className="space-y-5">
    <h1 className="text-xl font-semibold">Admin kullanıcı yönetimi</h1>
    {message && <p role="status" className="rounded border border-slate-700 p-3">{message}</p>}
    {canManage && <form className="space-y-3 rounded-xl border border-slate-800 p-5" onSubmit={(event) => { event.preventDefault(); invite.mutate({ name, email, roles }); }}>
      <h2 className="font-medium">Yönetici davet et</h2>
      <label className="block">Ad soyad<input className="mt-1 block w-full rounded bg-slate-900 p-3" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required /></label>
      <label className="block">E-posta<input className="mt-1 block w-full rounded bg-slate-900 p-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <AdminRoleSelector value={roles} onChange={setRoles} disabled={pending} />
      <button disabled={pending || roles.length === 0} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">Davet gönder</button>
      <p className="text-sm text-slate-400">Davet 24 saat geçerlidir. İlk girişte MFA kurulumu zorunludur.</p>
    </form>}
    {editing && <AdminUserEditor key={editing.id} user={editing} pending={pending} onClose={() => setEditing(null)} onSave={(input) => update.mutate({ id: editing.id, input })} />}
    {users.isLoading && <p>Yöneticiler yükleniyor…</p>}
    {users.isError && <p role="alert">Liste yüklenemedi. <button onClick={() => users.refetch()}>Tekrar dene</button></p>}
    {users.data?.map((user) => <article key={user.id} className="space-y-3 rounded-xl border border-slate-800 p-5">
      <h2 className="font-medium">{user.name} <span className="text-sm text-slate-400">{user.email}</span></h2>
      <p>{user.isActive ? 'Aktif' : 'Kilitli / etkin değil'} · MFA: {user.mfaEnabled ? 'Etkin' : 'Kurulmadı'} · Oturum: {user.activeSessionCount}</p>
      <p className="text-sm">Roller: {user.roles.join(', ')}</p>
      <p className="text-sm text-slate-400">Son giriş: {dateLabel(user.lastLoginAt)} · Başarısız giriş: {user.failedLoginCount} · Son başarısız deneme: {dateLabel(user.lastFailedLoginAt)}</p>
      <p className="text-sm text-slate-400">Davet: {{ NONE: 'Yok', PENDING: 'Bekliyor', EXPIRED: 'Süresi doldu', ACCEPTED: 'Kabul edildi' }[user.invitationStatus]} {user.invitationExpiresAt && `· Bitiş: ${dateLabel(user.invitationExpiresAt)}`}</p>
      {canManage && <div className="flex flex-wrap gap-4 text-sm">
        <button disabled={pending} onClick={() => setEditing(user)} className="text-blue-400">Rol / durum düzenle</button>
        <button disabled={pending || !user.activeSessionCount} onClick={() => revoke.mutate(user.id)} className="text-red-400">Tüm oturumları kapat</button>
        {['PENDING', 'EXPIRED'].includes(user.invitationStatus) && <button disabled={pending} onClick={() => invite.mutate({ name: user.name, email: user.email, roles: user.roles })}>Daveti yeniden gönder</button>}
      </div>}
    </article>)}
  </div>;
}
