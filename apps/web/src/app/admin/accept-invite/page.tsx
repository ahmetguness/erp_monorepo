'use client';

import { useState } from 'react';
import Link from 'next/link';
import { acceptAdminInvitation } from '@/services/admin-users.service';

export default function AcceptAdminInvitePage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  return <main className="min-h-screen bg-slate-950 px-5 py-20 text-white"><div className="mx-auto max-w-md space-y-5">
    <h1 className="text-xl font-semibold">Yönetici davetini kabul et</h1>
    {accepted ? <><p>Şifreniz oluşturuldu. Giriş yaparak MFA kurulumunu tamamlayın.</p><Link href="/admin/login" className="text-blue-400">Yönetici girişine git</Link></> : <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setError('');
      if (password !== confirmation) { setError('Şifreler eşleşmiyor.'); return; }
      const token = window.location.hash.slice(1);
      if (!token) { setError('Davet bağlantısı eksik. E-postadaki bağlantıyı açın.'); return; }
      setPending(true);
      try { await acceptAdminInvitation(token, password); window.history.replaceState(null, '', '/admin/accept-invite'); setPassword(''); setConfirmation(''); setAccepted(true); }
      catch { setError('Davet geçersiz, süresi dolmuş veya şifre uygun değil. Yeni davet isteyin.'); }
      finally { setPending(false); }
    }}>
      <p className="text-slate-400">En az 12 karakterlik şifre belirleyin. İlk girişte doğrulama uygulaması kurmanız gerekecek.</p>
      <label className="block">Yeni şifre<input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 block w-full rounded bg-slate-900 p-3" /></label>
      <label className="block">Şifre tekrar<input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 block w-full rounded bg-slate-900 p-3" /></label>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">{pending ? 'Kaydediliyor…' : 'Daveti kabul et'}</button>
    </form>}
  </div></main>;
}
