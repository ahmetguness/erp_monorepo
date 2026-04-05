'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, LogIn } from 'lucide-react';
import { useAdminAuthStore } from '@/store/admin-auth.store';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAdminAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      router.push('/admin');
    } catch {
      setError('Geçersiz email veya şifre.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Admin Panel</h1>
          <p className="text-sm text-slate-500 mt-1">Axon ERP Platform Yönetimi</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">{error}</div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
              placeholder="admin@axonerp.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-sm text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Şifre</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              placeholder="••••••••"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-sm text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/30" />
          </div>
          <button type="submit" disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-lg shadow-red-500/20 transition-all disabled:opacity-50">
            <LogIn className="w-4 h-4" />
            {isLoading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-700 mt-4">Platform yönetici erişimi</p>
      </div>
    </div>
  );
}
