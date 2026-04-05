'use client';

import { create } from 'zustand';
import { adminLogin, adminMe, type AdminUser } from '@/services/admin.service';

interface AdminAuthState {
  admin: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

function setCookie(name: string, value: string, days: number) {
  const d = new Date(); d.setTime(d.getTime() + days * 86400000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  admin: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { token, admin } = await adminLogin(email, password);
      setCookie('admin-token', token, 1);
      set({ admin, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error('Giriş başarısız');
    }
  },

  logout: () => {
    deleteCookie('admin-token');
    set({ admin: null });
    window.location.href = '/admin/login';
  },

  fetchMe: async () => {
    try {
      const admin = await adminMe();
      set({ admin });
    } catch {
      deleteCookie('admin-token');
      set({ admin: null });
    }
  },
}));
