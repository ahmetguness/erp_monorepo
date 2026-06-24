'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRegister } from '@/hooks/useAuth';
import { Eye, EyeOff, Building2, User, Mail, Lock, Loader2 } from 'lucide-react';
import { isPasswordStrong, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy';

const registerSchema = z
  .object({
    companyName: z.string().min(2, 'Şirket adı en az 2 karakter olmalıdır'),
    name: z.string().min(2, 'Ad Soyad en az 2 karakter olmalıdır'),
    email: z.string().min(1, 'E-posta zorunludur').email('Geçerli bir e-posta girin'),
    password: z.string().min(1, 'Şifre zorunludur').refine(isPasswordStrong, PASSWORD_POLICY_MESSAGE),
    confirmPassword: z.string().min(1, 'Şifre tekrarı zorunludur'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

function InputIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
      {children}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
      </svg>
      {message}
    </p>
  );
}

export default function RegisterPage() {
  const { mutate: registerUser, isPending } = useRegister();
  const [showPassword, setShowPassword] = useState(false);

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

  const inputBase =
    'w-full h-12 pl-11 pr-4 bg-slate-900/80 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:bg-slate-900 transition-all';
  const inputOk = 'border-slate-800 focus:ring-blue-500/30 focus:border-blue-500/40';
  const inputErr = 'border-red-500/50 focus:ring-red-500/30';

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Hesap Oluştur</h1>
        <p className="text-slate-400 text-sm">14 gün ücretsiz deneyin, kredi kartı gerekmez.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-slate-300 mb-2">
              Şirket Adı
            </label>
            <div className="relative">
              <InputIcon><Building2 className="w-[18px] h-[18px]" /></InputIcon>
              <input
                id="companyName"
                type="text"
                placeholder="Şirketinizin adı"
                {...register('companyName')}
                className={`${inputBase} ${errors.companyName ? inputErr : inputOk}`}
              />
            </div>
            <FieldError message={errors.companyName?.message} />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              Ad Soyad
            </label>
            <div className="relative">
              <InputIcon><User className="w-[18px] h-[18px]" /></InputIcon>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Adınız Soyadınız"
                {...register('name')}
                className={`${inputBase} ${errors.name ? inputErr : inputOk}`}
              />
            </div>
            <FieldError message={errors.name?.message} />
          </div>
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-sm font-medium text-slate-300 mb-2">
            E-posta adresi
          </label>
          <div className="relative">
            <InputIcon><Mail className="w-[18px] h-[18px]" /></InputIcon>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder="ornek@sirket.com"
              {...register('email')}
              className={`${inputBase} ${errors.email ? inputErr : inputOk}`}
            />
          </div>
          <FieldError message={errors.email?.message} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-slate-300 mb-2">
              Şifre
            </label>
            <div className="relative">
              <InputIcon><Lock className="w-[18px] h-[18px]" /></InputIcon>
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={PASSWORD_POLICY_MESSAGE}
                {...register('password')}
                className={`${inputBase} pr-11 ${errors.password ? inputErr : inputOk}`}
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
            <FieldError message={errors.password?.message} />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
              Şifre Tekrar
            </label>
            <div className="relative">
              <InputIcon><Lock className="w-[18px] h-[18px]" /></InputIcon>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('confirmPassword')}
                className={`${inputBase} ${errors.confirmPassword ? inputErr : inputOk}`}
              />
            </div>
            <FieldError message={errors.confirmPassword?.message} />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="relative w-full h-12 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 shadow-lg shadow-blue-600/10 hover:shadow-blue-600/20"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Hesap oluşturuluyor…
            </span>
          ) : (
            'Ücretsiz Başla'
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800/50 text-center">
        <p className="text-sm text-slate-500">
          Zaten hesabınız var mı?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Giriş Yap
          </Link>
        </p>
      </div>
    </>
  );
}
