'use client';

import { create } from 'zustand';
import type { AdminLoginResult } from '@repo/types';
import { adminLogin, adminLogout, adminMe, type AdminUser } from '@/services/admin.service';

interface AdminAuthState {
  admin: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string, otp?: string, rememberMe?: boolean) => Promise<AdminLoginResult>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  admin: null,
  isLoading: false,

  login: async (email, password, otp, rememberMe) => {
    set({ isLoading: true });
    try {
      const result = await adminLogin(email, password, otp, rememberMe);
      set({ admin: result.status === 'AUTHENTICATED' ? result.admin : null, isLoading: false });
      return result;
    } catch {
      set({ isLoading: false });
      throw new Error('Giriş başarısız');
    }
  },

  logout: async () => {
    await adminLogout();
    set({ admin: null });
    window.location.href = '/admin/login';
  },

  fetchMe: async () => {
    try {
      const admin = await adminMe();
      set({ admin });
    } catch {
      set({ admin: null });
      throw new Error('Admin oturumu bulunamadı');
    }
  },
}));
