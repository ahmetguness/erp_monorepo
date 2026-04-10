'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Lock, User as UserIcon, Loader2, CheckCircle2, XCircle, Building2 } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Status = 'validating' | 'ready' | 'submitting' | 'success' | 'error';

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [status, setStatus] = useState<Status>('validating');
  const [errorMsg, setErrorMsg] = useState('');
  const [tenantName, setTenantName] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!token || !email) {
      setStatus('error');
      setErrorMsg('Geçersiz davet linki.');
      return;
    }
    axios
      .post(`${API_URL}/api/public/invitations/validate`, { token, email })
      .then((res) => {
        setTenantName(res.data.tenantName || '');
        setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'Davet linki geçersiz veya süresi dolmuş.');
      });
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Ad soyad zorunludur.'); return; }
    if (password.length < 8) { setFormError('Şifre en az 8 karakter olmalıdır.'); return; }
    if (password !== confirmPassword) { setFormError('Şifreler eşleşmiyor.'); return; }

    setStatus('submitting');
    try {
      await axios.post(`${API_URL}/api/public/invitations/accept`, { token, email, name: name.trim(), password });
      setStatus('success');
    } catch (err: any) {
      setStatus('ready');
      setFormError(err.response?.data?.error || 'Bir hata oluştu.');
    }
  };

  if (status === 'validating') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        <p className="text-sm text-slate-400">Davet doğrulanıyor…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle className="w-6 h-6 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Geçersiz Davet</h1>
        <p className="text-sm text-slate-400 text-center max-w-xs">{errorMsg}</p>
        <Link href="/login" className="mt-2 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
          Giriş sayfasına dön
        </Link>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Hesabınız Oluşturuldu</h1>
        <p className="text-sm text-slate-400 text-center max-w-xs">
          {tenantName} ekibine katıldınız. Artık giriş yapabilirsiniz.
        </p>
        <button onClick={() => router.push('/login')}
          className="mt-2 h-10 px-6 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950">
          Giriş Yap
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-5 h-5 text-blue-400" />
          <span className="text-sm text-blue-400 font-medium">{tenantName}</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Daveti Kabul Et</h1>
        <p className="text-slate-400 text-sm">Hesabınızı oluşturmak için bilgilerinizi girin.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">Ad Soyad</label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              <UserIcon className="w-[18px] h-[18px]" />
            </div>
            <input id="name" type="text" placeholder="Adınız Soyadınız" value={name}
              onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full h-12 pl-11 pr-4 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 focus:bg-slate-900 transition-all" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">E-posta</label>
          <input type="email" value={email} disabled
            className="w-full h-12 px-4 bg-slate-900/40 border border-slate-800 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">Şifre</label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              <Lock className="w-[18px] h-[18px]" />
            </div>
            <input id="password" type={showPassword ? 'text' : 'password'} placeholder="En az 8 karakter"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 pl-11 pr-11 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 focus:bg-slate-900 transition-all" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors" tabIndex={-1}>
              {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">Şifre Tekrar</label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              <Lock className="w-[18px] h-[18px]" />
            </div>
            <input id="confirmPassword" type="password" placeholder="Şifrenizi tekrar girin"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-12 pl-11 pr-4 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 focus:bg-slate-900 transition-all" />
          </div>
        </div>

        {formError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{formError}
          </p>
        )}

        <button type="submit" disabled={status === 'submitting'}
          className="relative w-full h-12 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 shadow-lg shadow-blue-600/10 hover:shadow-blue-600/20">
          {status === 'submitting' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />Hesap oluşturuluyor…
            </span>
          ) : 'Hesabımı Oluştur'}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800/50 text-center">
        <p className="text-sm text-slate-500">
          Zaten hesabınız var mı?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Giriş yapın</Link>
        </p>
      </div>
    </>
  );
}
