'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useLogin } from '@/hooks/useAuth';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'E-posta zorunludur').email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre zorunludur'),
  rememberMe: z.boolean(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { mutate: login, isPending, isSuccess } = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const isLoading = isPending || isSuccess;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = (data: LoginForm) => {
    login({
      credentials: { email: data.email, password: data.password },
      rememberMe: data.rememberMe,
    });
  };

  return (
    <>
      {/* Full-screen loading overlay — visible during redirect */}
      {isSuccess && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-sm text-slate-400">Yönlendiriliyorsunuz…</span>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Hoş geldiniz</h1>
        <p className="text-slate-400 text-sm">Hesabınıza giriş yaparak devam edin.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
            E-posta adresi
          </label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              <Mail className="w-[18px] h-[18px]" />
            </div>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="ornek@sirket.com"
              {...register('email')}
              className={`w-full h-12 pl-11 pr-4 bg-slate-900/80 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:bg-slate-900 transition-all ${
                errors.email
                  ? 'border-red-500/50 focus:ring-red-500/30'
                  : 'border-slate-800 focus:ring-blue-500/30 focus:border-blue-500/40'
              }`}
            />
          </div>
          {errors.email && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-300">
              Şifre
            </label>
            <Link
              href="#"
              className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
            >
              Şifremi unuttum
            </Link>
          </div>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              <Lock className="w-[18px] h-[18px]" />
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              className={`w-full h-12 pl-11 pr-11 bg-slate-900/80 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:bg-slate-900 transition-all ${
                errors.password
                  ? 'border-red-500/50 focus:ring-red-500/30'
                  : 'border-slate-800 focus:ring-blue-500/30 focus:border-blue-500/40'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            >
              {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Remember me */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              {...register('rememberMe')}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors">
              Oturumu açık tut
            </span>
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="relative w-full h-12 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 shadow-lg shadow-blue-600/10 hover:shadow-blue-600/20"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Giriş yapılıyor…
            </span>
          ) : (
            'Giriş Yap'
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800/50 text-center">
        <p className="text-sm text-slate-500">
          Hesabınız yok mu?{' '}
          <Link
            href="/register"
            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Ücretsiz deneyin
          </Link>
        </p>
      </div>
    </>
  );
}
