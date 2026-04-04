'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useLogin } from '@/hooks/useAuth';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, 'E-posta zorunludur').email('Geçerli bir e-posta girin'),
  password: z.string().min(1, 'Şifre zorunludur'),
});

type LoginForm = z.infer<typeof loginSchema>;

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function LoginPage() {
  const { mutate: login, isPending } = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    login(data);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
      <h1 className="text-xl font-semibold text-white mb-1">Giriş Yap</h1>
      <p className="text-slate-400 text-sm mb-6">Hesabınıza erişmek için bilgilerinizi girin.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
            E-posta
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="ornek@sirket.com"
            {...register('email')}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
            Şifre
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
          />
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          {isPending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Hesabınız yok mu?{' '}
        <Link href="/register" className="text-sky-400 hover:text-sky-300 font-medium transition-colors">
          Kayıt Ol
        </Link>
      </p>
    </div>
  );
}
