import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, TenantInfo } from '@repo/types';

// ─────────────────────────────────────────────
// Auth Store
// ─────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  tenant: TenantInfo | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (user: AuthUser, token: string, tenant: TenantInfo) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  token: null,
  tenant: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...initialState,

      login: (user, token, tenant) => {
        if (typeof window !== 'undefined') {
          const maxAge = 7 * 24 * 60 * 60;
          document.cookie = `axon_token=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
          document.cookie = `axon_tenant_id=${tenant.id}; path=/; max-age=${maxAge}; SameSite=Lax`;
        }
        set({ user, token, tenant, isAuthenticated: true });
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          document.cookie = 'axon_token=; path=/; max-age=0';
          document.cookie = 'axon_tenant_id=; path=/; max-age=0';
        }
        set(initialState);
      },

      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
    }),
    {
      name: 'axon-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
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
