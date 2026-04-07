'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { login, register, getMe } from '@/services/auth.service';
import { getErrorMessage } from '@/types/api.types';
import type { LoginCredentials, RegisterData } from '@/services/auth.service';

// ─────────────────────────────────────────────
// useLogin
// ─────────────────────────────────────────────

export function useLogin() {
  const router = useRouter();
  const { login: storeLogin } = useAuthStore();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (vars: { credentials: LoginCredentials; rememberMe: boolean }) =>
      login(vars.credentials),
    onSuccess: (data, vars) => {
      console.log('LOGIN TENANT DATA:', JSON.stringify(data.tenant));
      storeLogin(data.user, data.token, data.tenant, vars.rememberMe);
      toast.success(`Hoş geldiniz, ${data.user.name}`);
      router.push('/dashboard');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });
}

// ─────────────────────────────────────────────
// useRegister
// ─────────────────────────────────────────────

export function useRegister() {
  const router = useRouter();
  const { login: storeLogin } = useAuthStore();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (data: RegisterData) => register(data),
    onSuccess: (data) => {
      storeLogin(data.user, data.token, data.tenant);
      toast.success('Hesabınız oluşturuldu. Hoş geldiniz!');
      router.push('/dashboard');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });
}

// ─────────────────────────────────────────────
// useLogout
// ─────────────────────────────────────────────

export function useLogout() {
  const router = useRouter();
  const { logout: storeLogout } = useAuthStore();
  const { toast } = useUIStore();

  return () => {
    storeLogout();
    toast.info('Çıkış yapıldı.');
    router.push('/login');
  };
}

// ─────────────────────────────────────────────
// useMe — refresh current user from server
// ─────────────────────────────────────────────

export function useMe() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });
}

// ─────────────────────────────────────────────
// useCurrentUser — read from store (no network)
// ─────────────────────────────────────────────

export function useCurrentUser() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return { user, tenant, isAuthenticated };
}
