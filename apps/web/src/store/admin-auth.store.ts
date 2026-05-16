'use client';

import { create } from 'zustand';
import { adminLogin, adminLogout, adminMe, type AdminUser } from '@/services/admin.service';

interface AdminAuthState {
  admin: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  admin: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { admin } = await adminLogin(email, password);
      set({ admin, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error('Giriş başarısız');
    }
  },

  logout: () => {
    adminLogout().catch(() => {});
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
