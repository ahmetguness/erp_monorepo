import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, TenantInfo } from '@repo/types';

// ─────────────────────────────────────────────
// Auth Store
// ─────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  tenant: TenantInfo | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (user: AuthUser, tenant: TenantInfo, rememberMe?: boolean) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
  /** Sunucudan gelen güncel tenant + user bilgisini store'a yazar (cookie'ye dokunmaz). */
  syncFromServer: (user: AuthUser, tenant: TenantInfo) => void;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  tenant: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...initialState,

      login: (user, tenant) => {
        set({ user, tenant, isAuthenticated: true });
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          document.cookie = 'axon_token=; path=/; max-age=0';
        }
        set(initialState);
      },

      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),

      syncFromServer: (user, tenant) =>
        set({ user, tenant }),
    }),
    {
      name: 'axon-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// Selectors
export const selectUser = (state: AuthStore) => state.user;
export const selectTenant = (state: AuthStore) => state.tenant;
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
export const selectTenantPlan = (state: AuthStore) => state.tenant?.plan;
