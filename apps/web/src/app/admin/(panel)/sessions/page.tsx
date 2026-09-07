'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closeAdminSession, closeAllAdminSessions, listAdminSecurityEvents, listAdminSessions, reauthenticateAdmin } from '@/services/admin-session.service';

export default function AdminSessionsPage() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const sessions = useQuery({ queryKey: ['admin', 'sessions'], queryFn: listAdminSessions });
  const events = useQuery({ queryKey: ['admin', 'security-events'], queryFn: listAdminSecurityEvents });
  const reauth = useMutation({
    mutationFn: () => reauthenticateAdmin(password, otp),
    onSuccess: () => { setPassword(''); setOtp(''); setMessage('Kimliğiniz doğrulandı. Kritik işleminizi şimdi tekrar başlatabilirsiniz.'); },
    onError: () => setMessage('Doğrulama başarısız. Şifreyi ve yeni bir doğrulama kodunu kontrol edin.'),
  });
  const revoke = useMutation({
    mutationFn: closeAdminSession,
    onSuccess: async (_, id) => {
      if (sessions.data?.find((session) => session.id === id)?.current) window.location.assign('/admin/login');
      else await queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] });
    },
  });
  const revokeAll = useMutation({ mutationFn: closeAllAdminSessions, onSuccess: () => window.location.assign('/admin/login') });
  const inputClass = 'block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white';
  return <div className="space-y-6">
    <h1 className="text-xl font-semibold">Oturumlar ve kimlik doğrulama</h1>
    <form className="max-w-lg space-y-3 rounded-xl border border-slate-800 p-5" onSubmit={(event) => { event.preventDefault(); reauth.mutate(); }}>
      <h2 className="font-medium">Kritik işlemler için yeniden doğrulama</h2>
      <p className="text-sm text-slate-400">Doğrulama 10 dakika geçerlidir. Girişte kullandığınız koddan sonra yeni kodun oluşmasını bekleyin.</p>
      <label className="block">Şifre<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className={inputClass} /></label>
      <label className="block">Doğrulama kodu<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} required className={inputClass} /></label>
      <button disabled={reauth.isPending} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">Doğrula</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
    <section className="space-y-3">
      <h2 className="font-medium">Aktif cihazlar</h2>
      {sessions.isLoading && <p>Oturumlar yükleniyor…</p>}
      {(sessions.isError || revoke.isError || revokeAll.isError) && <p role="alert">Oturum işlemi başarısız. Tekrar deneyin.</p>}
      {sessions.data?.map((session) => <div key={session.id} className="rounded-xl border border-slate-800 p-4 space-y-2">
        <p className="break-words">{session.deviceName} {session.current && '(Bu cihaz)'}</p>
        <p className="text-sm text-slate-400">{session.ipAddress ?? 'IP bilgisi yok'} · Son etkinlik: {new Date(session.lastSeenAt).toLocaleString('tr-TR')}</p>
        <p className="text-sm text-slate-400">Bitiş: {new Date(session.expiresAt).toLocaleString('tr-TR')}</p>
        <button onClick={() => revoke.mutate(session.id)} disabled={revoke.isPending} className="text-red-400">Oturumu kapat</button>
      </div>)}
      <button onClick={() => revokeAll.mutate()} disabled={revokeAll.isPending} className="rounded bg-red-600 px-4 py-2">Tüm cihazlardan çıkış yap</button>
    </section>
    <section className="space-y-3"><h2 className="font-medium">Güvenlik bildirimleri</h2>
      {events.isError && <p role="alert">Bildirimler yüklenemedi.</p>}
      {events.data?.length === 0 && <p className="text-slate-400">Güvenlik bildirimi yok.</p>}
      {events.data?.map((event) => <div key={event.id} className="rounded border border-amber-600/40 p-4"><p>{event.message}</p><p className="text-sm text-slate-400">{event.ipAddress} · {new Date(event.createdAt).toLocaleString('tr-TR')}</p></div>)}
    </section>
  </div>;
}
