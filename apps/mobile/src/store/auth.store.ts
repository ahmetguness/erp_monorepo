import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser, TenantInfo } from '../services/auth.service';

interface AuthState {
  user: AuthUser | null;
  tenant: TenantInfo | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (user: AuthUser, tenant: TenantInfo) => void;
  logout: () => void;
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
        set(initialState);
      },

      syncFromServer: (user, tenant) => {
        set({ user, tenant });
      },
    }),
    {
      name: 'axon-mobile-auth', // key for async storage
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selectors
export const selectUser = (state: AuthStore) => state.user;
export const selectTenant = (state: AuthStore) => state.tenant;
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
