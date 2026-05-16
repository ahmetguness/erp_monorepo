'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAdminAuthStore } from '@/store/admin-auth.store';

const LOG_LINES = [
  { time: '09:41:02', msg: 'auth-service ready on :3001', type: 'ok' },
  { time: '09:41:02', msg: 'database connected (pg:5432)', type: 'ok' },
  { time: '09:41:03', msg: 'redis cache pool initialized', type: 'ok' },
  { time: '09:41:03', msg: 'cron: invoice-sync scheduled', type: 'info' },
  { time: '09:41:04', msg: 'tls certificate valid (327d)', type: 'ok' },
  { time: '09:41:04', msg: 'rate-limiter active: 100req/min', type: 'info' },
  { time: '09:41:05', msg: 'waiting for admin authentication…', type: 'warn' },
];

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAdminAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState(0);

  useEffect(() => {
    if (visibleLogs < LOG_LINES.length) {
      const t = setTimeout(() => setVisibleLogs((v) => v + 1), 300 + visibleLogs * 120);
      return () => clearTimeout(t);
    }
  }, [visibleLogs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      setIsRedirecting(true);
      router.push('/admin');
    } catch {
      setError('Kimlik doğrulama başarısız.');
    }
  };

  const isBusy = isLoading || isRedirecting;

  const inputCls =
    'w-full h-11 px-3.5 bg-[#0c0c0c] border border-[#1e1e1e] rounded-lg text-[13px] text-white placeholder-neutral-700 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/30 transition-all';

  return (
    <div className="min-h-screen bg-[#080808] flex relative overflow-hidden">
      {/* Redirect overlay */}
      {isRedirecting && (
        <div className="fixed inset-0 z-50 bg-[#080808]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-sm text-neutral-400">Yönlendiriliyorsunuz…</span>
        </div>
      )}

      {/* Subtle grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col border-r border-[#141414] relative">
        <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-blue-500/[0.03] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full p-8 xl:p-10">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-16 group">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight block leading-tight group-hover:text-blue-400 transition-colors">
                Axon<span className="text-blue-400">ERP</span>
              </span>
              <span className="text-[9px] font-mono text-neutral-600 tracking-widest">PLATFORM ADMIN</span>
            </div>
          </Link>

          {/* System metrics */}
          <div className="grid grid-cols-2 gap-2.5 mb-10">
            {[
              { label: 'Tenants', value: '24', sub: 'aktif' },
              { label: 'Uptime', value: '99.97', sub: '%' },
              { label: 'API', value: '12ms', sub: 'avg' },
              { label: 'DB', value: '847', sub: 'qps' },
            ].map((m) => (
              <div key={m.label} className="bg-[#0e0e0e] border border-[#181818] rounded-xl px-4 py-3">
                <div className="text-[10px] font-mono text-neutral-600 mb-1">{m.label}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-white font-mono tabular-nums">{m.value}</span>
                  <span className="text-[10px] text-neutral-600 font-mono">{m.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Terminal log */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-[#252525]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-[#252525]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-[#252525]" />
              </div>
              <span className="text-[10px] font-mono text-neutral-700 ml-1">system.log</span>
            </div>

            <div className="flex-1 bg-[#0a0a0a] border border-[#151515] rounded-xl p-4 overflow-hidden font-mono text-[11px] leading-relaxed">
              {LOG_LINES.slice(0, visibleLogs).map((line, i) => (
                <div
                  key={i}
                  className="flex gap-2 mb-1 animate-[fadeIn_0.3s_ease-out]"
                  style={{ animationFillMode: 'both', animationDelay: `${i * 0.05}s` }}
                >
                  <span className="text-neutral-700 flex-shrink-0">{line.time}</span>
                  <span className={
                    line.type === 'ok'
                      ? 'text-emerald-600'
                      : line.type === 'warn'
                      ? 'text-blue-500'
                      : 'text-neutral-600'
                  }>
                    {line.msg}
                  </span>
                </div>
              ))}
              {visibleLogs >= LOG_LINES.length && (
                <div className="flex gap-2 mt-1">
                  <span className="text-neutral-700">09:41:05</span>
                  <span className="text-blue-400/80 animate-pulse">▊</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#141414]">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-mono text-neutral-600">Tüm sistemler çalışıyor</span>
            </div>
            <span className="text-[10px] font-mono text-neutral-700">v2.4.1</span>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-10">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                Axon<span className="text-blue-400">ERP</span>
              </span>
            </Link>
          </div>

          {/* Header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 bg-blue-500/5 border border-blue-500/10 rounded-full px-3 py-1 mb-5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span className="text-[10px] font-mono text-blue-400/80 tracking-wide">YETKİLİ ERİŞİM</span>
            </div>
            <h1 className="text-[1.6rem] font-bold text-white mb-2 leading-tight">Yönetici Girişi</h1>
            <p className="text-sm text-neutral-500">Platform kontrol paneline erişmek için kimlik doğrulayın.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3 flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <span className="text-xs text-red-400">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="block text-xs font-medium text-neutral-400 mb-2">
                E-posta adresi
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@axonerp.com"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-medium text-neutral-400 mb-2">
                Şifre
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-neutral-700 bg-[#0c0c0c] text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-xs text-neutral-500 group-hover:text-neutral-300 transition-colors">
                Oturumu açık tut
              </span>
            </label>

            <button
              type="submit"
              disabled={isBusy}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-[#080808] shadow-lg shadow-blue-600/5 hover:shadow-blue-600/10"
            >
              {isBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Doğrulanıyor…
                </span>
              ) : (
                'Kimlik Doğrula'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-[#141414] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-[10px] text-neutral-600">Şifreli bağlantı</span>
            </div>
            <span className="text-[10px] text-neutral-700">© {new Date().getFullYear()} Axon ERP</span>
          </div>
        </div>
      </div>
    </div>
  );
}
