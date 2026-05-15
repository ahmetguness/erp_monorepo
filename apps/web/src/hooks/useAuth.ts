'use client';

import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { login, logout, register, getMe } from '@/services/auth.service';
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
      login({ ...vars.credentials, rememberMe: vars.rememberMe }),
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
  const { logout: storeLogout } = useAuthStore();

  return () => {
    logout().catch(() => {});
    storeLogout();
    // Hard redirect — React layout'un spinner render etmesini önler.
    // router.replace yerine window.location kullanılır; böylece
    // isAuthenticated=false olduğunda layout hiç re-render etmez.
    window.location.replace('/login');
  };
}

// ─────────────────────────────────────────────
// useMe — refresh current user from server
// ─────────────────────────────────────────────

export function useMe() {
  const { isAuthenticated, syncFromServer } = useAuthStore();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });

  // Sunucudan gelen güncel user + tenant'ı store'a yaz
  // (plan, modules gibi admin tarafından değiştirilen alanlar yansısın)
  const { data } = query;
  useEffect(() => {
    if (data) syncFromServer(data.user, data.tenant);
  }, [data, syncFromServer]);

  return query;
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
