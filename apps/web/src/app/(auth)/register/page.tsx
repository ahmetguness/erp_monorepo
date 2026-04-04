'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRegister } from '@/hooks/useAuth';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const registerSchema = z.object({
  companyName: z.string().min(2, 'Şirket adı en az 2 karakter olmalıdır'),
  name: z.string().min(2, 'Ad Soyad en az 2 karakter olmalıdır'),
  email: z.string().min(1, 'E-posta zorunludur').email('Geçerli bir e-posta girin'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır'),
  confirmPassword: z.string().min(1, 'Şifre tekrarı zorunludur'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Şifreler eşleşmiyor',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function RegisterPage() {
  const { mutate: registerUser, isPending } = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = ({ confirmPassword: _, ...data }: RegisterForm) => {
    registerUser(data);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
      <h1 className="text-xl font-semibold text-white mb-1">Hesap Oluştur</h1>
      <p className="text-slate-400 text-sm mb-6">14 gün ücretsiz deneyin, kredi kartı gerekmez.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Company */}
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-slate-300 mb-1.5">
            Şirket Adı
          </label>
          <input
            id="companyName"
            type="text"
            placeholder="Şirketinizin adı"
            {...register('companyName')}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
          />
          {errors.companyName && (
            <p className="mt-1.5 text-xs text-red-400">{errors.companyName.message}</p>
          )}
        </div>

        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5">
            Ad Soyad
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Adınız Soyadınız"
            {...register('name')}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
          />
          {errors.name && (
            <p className="mt-1.5 text-xs text-red-400">{errors.name.message}</p>
          )}
        </div>

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
            autoComplete="new-password"
            placeholder="En az 8 karakter"
            {...register('password')}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
          />
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1.5">
            Şifre Tekrar
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            {...register('confirmPassword')}
            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
          />
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-red-400">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          {isPending ? 'Hesap oluşturuluyor…' : 'Ücretsiz Başla'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Zaten hesabınız var mı?{' '}
        <Link href="/login" className="text-sky-400 hover:text-sky-300 font-medium transition-colors">
          Giriş Yap
        </Link>
      </p>
    </div>
  );
}
